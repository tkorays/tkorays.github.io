---
layout: post
title: WebRTC的Pacer实现和原理
---

> tkorays: 未经同意，不得转载。

# 1. pacer介绍
pacer（或者称pacing，平滑发送）在WebRTC的拥塞控制中是比较重要的一个模块，良好的拥塞控制少不了对发送码率的精准控制。Pacer的功能在于根据拥塞控制的结果控制发送码率；同时它也承担了部分探测功能，按照拥塞控制模块的指示，发送探测报文等。

下面，我们将从宏观到代码角度去介绍下pacer，因为篇幅限制不可能面面俱到，所以只会介绍主要思想和逻辑，希望能让大家理解pacer的思想，对pacer有更深入的思考。

# 2. pacer的模块设计
如果让你设计一个Pacing，你该怎么设计？没有pacer存在报文会直接到网络中，增加了pacer后，报文会先缓存起来，等待pacer的调度，其输入输出如下：

输入：
> 1. Congestion Controller模块的估计带宽，pacer要根据这个带宽去控制发送
> 2. Congestion Controller设置的probing、padding带宽，pacer模块要为CC模块做一些探测工作
> 3. 即将发送的报文，pacer需要发送报文的id、大小等信息，在pacer内部去做统一调度

输出：
> 1. 出发报文发送，pacer会去调度在什么时候发送什么报文到网络中


按照上面的思路，我们可以设计pacer的对外接口：
```cpp
class PacedSender {
public:
    // pacer通过PacketRouter这个callback通知将报文发送到网络中
    PacedSender(Clock* clock, PacketRouter* packet_router);

    // 设置估计的带宽以及padding码率
    void SetPacingRates(DataRate pacing_rate, DataRate padding_rate);
    // 用于CC模块做probing
    void CreateProbeCluster(DataRate bitrate, int cluster_id);
    // 输入发送的报文信息供pacer调度
    void EnqueuePackets(
        std::vector<std::unique_ptr<RtpPacketToSend>> packet);

protected:
    // 按照5ms调度发送多少数据
    void Process();
};
```

`PacketRouter`我们可以简单设计下如下，至于详细的发送逻辑不在pacing的考虑范围内，这里不作太多介绍。
```cpp
class PacketRouter {
public:
    // 发送报文到网络中，在这里打上transport sequence number
    void SendPacket(std::unique_ptr<RtpPacketToSend> packet,
                  const PacedPacketInfo& cluster_info);
};
```
如果把所有的算法实现都写到对外接口`PacedSender`中会显得比较乱，因此，我们可以把pacing的具体逻辑放到一个单独的类`PacingController`中，`PacedSender`持有该对象：
```cpp
// This class implements a leaky-bucket packet pacing algorithm. It handles the
// logic of determining which packets to send when, but the actual timing of
// the processing is done externally (e.g. PacedSender). Furthermore, the
// forwarding of packets when they are ready to be sent is also handled
// externally, via the PacedSendingController::PacketSender interface.
//
class PacingController {
public:
    PacingController(Clock* clock,
                   PacketSender* packet_sender);
    void EnqueuePacket(std::unique_ptr<RtpPacketToSend> packet);
    void CreateProbeCluster(DataRate bitrate, int cluster_id);
    void SetPacingRates(DataRate pacing_rate, DataRate padding_rate);
    
    // ...
};
```

`PacingController`实现了一个漏桶算法，用于控制什么时候发送什么报文。

# 3. Pacer的实现原理
通过上面的介绍，想必大家已经对pacer的流程有比价清楚的认识了，下面将介绍下pacer的实现原理。这个章节的内容主要围绕`PacingController`的设计展开。

在设计前，我们回想下漏桶算法，不论我们的往pacer中的输入码率如何打，pacing输出的码率总是按照设定的码率流出。为了毫秒级别的可控，pacer的调度周期默认设置为5ms，即每5ms调度一次是否需要发送。

## 3.1 pacer预算控制类`IntervalBudget`
我们如果想保证我们的发送码率总是按照设定的来，就需要去测量和控制发送码率，因此需要设计一个budget类来控制一段时间内的发送量，确保发送足够平滑。

在我们先介绍下`IntervalBudget`这个类的设计之前，我们先想想当我们发送报文的时候需要花费预算，那预算是怎么来的？仔细想想可以知道，随着时间的流逝我们的预算在增加。举个例子：
> 如果当前设置的pacing码率为A，那么每隔delta时间后，增加的预算为A*delta/8字节。
> 一开始我们的budget为0，时间流逝5ms，我们就增加了5ms的预算可以用。

还有个需要考虑的问题，我们的预算也是时效性的，假如说在1s内我们没有发送任何数据，那么这1s内增加的预算并不能一直攒到后面的周期。`can_build_up_underuse_`可以控制没用完的预算是否可以用大下个周期。这里的窗口设置为500ms，即我们累积/借用的预算不能超过500ms。

```cpp
class IntervalBudget {
 public:
  explicit IntervalBudget(int initial_target_rate_kbps);
  IntervalBudget(int initial_target_rate_kbps, bool can_build_up_underuse);

  // 设置pacing码率，可以得到最大累积/借用的字节数
  void set_target_rate_kbps(int target_rate_kbps);

  // 流逝delta_time_ms，增加预算
  // can_build_up_underuse_决定前一个5ms没有用完的budget是否可以接着用
  void IncreaseBudget(int64_t delta_time_ms);

  // 从bytes_remaining_里面扣除
  void UseBudget(size_t bytes);

 private:
  int target_rate_kbps_;        // 设置的pacing码率
  int64_t max_bytes_in_budget_; // 最大预算限制: 500ms时间窗口的预算，累积/借用不超过500ms窗口
  int64_t bytes_remaining_;     // 预算折算成字节数，一开始为0
  bool can_build_up_underuse_;  // 上个周期没有使用完（underuse），是否可以借用
```

## 3.2 Pacer的轮询调度(round robin)算法
pacer决定什么时候发送什么报文时通过轮询调度的方式决定，这里使用了`RoundRobinPacketQueue`来实现了轮询方式调度流，即维护一个流级别的优先级，流以SSRC作为标识，以流的优先级和排队字节数为最终优先级判断，每次轮询调度最高优先级的流。流内部的不同报文也有优先级之分，根据其优先级、入队顺序、是否为重传决定发送顺序。

### 3.2.1 流之间的优先级轮询调度
不同流的优先级使用流优先级和排队字节数来决定，优先级相同时排队字节数多的将优先得到调度，见`StreamPrioKey`：
```cpp
  struct StreamPrioKey {
    bool operator<(const StreamPrioKey& other) const {
      if (priority != other.priority)
        return priority < other.priority;
      return size < other.size;
    }

    const int priority;
    const DataSize size;
  };
```

所有流在`RoundRobinPacketQueue`中以`std::multimap<StreamPrioKey, uint32_t> stream_priorities_`这个multimap方式保存优先级信息，这个multimap本身可以根据`StreamPrioKey`排序，`RoundRobinPacketQueue`在pop函数调度刷新优先级：
* 从优先级队列stream_priorities_中选取最高优先级的流调度
* 从该流中获取一个报文
* 将该流从优先级队列中移除，并新增一个pair（刷新map，主要是更新了排队字节数），如果没有报文了则不用在map中增加pair

因此这里的轮询算法可能会一直调度一个流，直至其优先级低于另外一路流。


### 3.2.2 流内报文的优先级调度
上面我们讲的都是不同流之间的优先级调度，在同一个流之间，还会有优先级之分。比如我们可能会将FEC和重传都放到同一个流里面调度（修改FEC和重传的SSRC为其媒体流的SSRC），此时这个流不同报文之间也有优先级队列之分。流的定义如下：
```cpp
struct Stream {
    DataSize size;  // 当前流在pacer中排队的字节数
    uint32_t ssrc;  // 当前流的SSRC

    PriorityPacketQueue packet_queue;   // 一个优先级队列，保存所有排队的报文信息（非原始报文）

    // 这个迭代器可以用来判断这条流有没有被调度，如果没有被调度则需要加入调度
    // 如果已经被调度，优先级改变时需要重新设置优先级
    std::multimap<StreamPrioKey, uint32_t>::iterator priority_it;
  };
```

这里以`QueuedPacket`来封装被调度的报文，流内的报文也可以有不同的优先级，且保证先进先出、重传优先：
```cpp
bool RoundRobinPacketQueue::QueuedPacket::operator<(
    const RoundRobinPacketQueue::QueuedPacket& other) const {
  if (priority_ != other.priority_)
    return priority_ > other.priority_;
  if (is_retransmission_ != other.is_retransmission_)
    return other.is_retransmission_;

  return enqueue_order_ > other.enqueue_order_;
}
```
这里报文优先级队列`PriorityPacketQueue`实际上是继承了STL的`priority_queue`优先级队列。

所以不同流的优先级和同一个流内的报文优先级被安排的明明白白，每次调度来获取报文的时候都能拿到最高优先级的报文发送出去。

不同流/报文类型的优先级如下：
```cpp
int GetPriorityForType(RtpPacketMediaType type) {
  // Lower number takes priority over higher.
  switch (type) {
    case RtpPacketMediaType::kAudio:
      // Audio is always prioritized over other packet types.
      return kFirstPriority + 1;
    case RtpPacketMediaType::kRetransmission:
      // Send retransmissions before new media.
      return kFirstPriority + 2;
    case RtpPacketMediaType::kVideo:
    case RtpPacketMediaType::kForwardErrorCorrection:
      // Video has "normal" priority, in the old speak.
      // Send redundancy concurrently to video. If it is delayed it might have a
      // lower chance of being useful.
      return kFirstPriority + 3;
    case RtpPacketMediaType::kPadding:
      // Packets that are in themselves likely useless, only sent to keep the
      // BWE high.
      return kFirstPriority + 4;
  }
}
```

### 3.2.3 单报文队列
`RoundRobinPakcetQueue`中还增加了一个优化，即队列中只有一个报文，可以降为单报文队列，就不需要上面那些复杂的多流、报文队列方式，可以简化逻辑&提升性能。这里就不多介绍了。


### 3.2.4 pacer中的时间统计
在进入下一个章节之前，我们先需要了解下pacer中的一些统计，因为pacer的定时调度需要用到这些时间来参考。
* `pacer中报文的总排队时间`，是队列中所有的报文从插入开始到现在在队列中排队时间，报文被调度后扣除其时间，插入其他报文时刷新总时间。
* `报文平均排队时间`，用上面的总排队时间除报文个数即可得到

## 3.3 Pacer的定时调度
pacer的定时调度一般是5ms间隔。简化后的定时调度处理如下：
* 每次调度增加media_budget_，增加的量由两次调度的间隔确定
* 从`RoundRobinPakcetQueue`中获取一个报文发送（GetPendingPacket），如果media_budget_小于0或者当前处于拥塞状态，则当前无法发送任何报文。（可以通过开关控制音频报文是否经过pacer调度。）
* 如果获取到报文，更新media_budget_，根据发送报文字节数扣除，扣除时需要考虑overhead

# 4. Pacer中的Probing和Padding
上面已经将pacer的功能大致讲完了，这里还要补充下Probing和Padding相关的功能。

## 4.1 Padding
拥塞控制模块为了带宽的稳定，可能会设置padding码率，让发送码率维持在一个稳定的水平。Pacer收到CC的配置后，在发送码率不够的时候会增加padding确保发送码率稳定在设置的码率。其流程如下：

* 每次调度增加padding_budget_，增加的量由两次调度的间隔确定
* 先从`RoundRobinPakcetQueue`发送报文，更新padding_budget_；`RoundRobinPakcetQueue`无报文可以发送的时候，计算后需要补足多少的padding数据，拥塞、budget不够时不需要发送padding
* 需要发padding的时候产生padding包(`GeneratePadding`)，一般会选择最近发送的报文，如果报文大小不满足需要则生成无意义的报文
* 更新padding_budget_，根据发送报文字节数扣除，扣除时需要考虑overhead


## 4.2 Probing
Probing也是Congestion Controller模块的一个带宽探测策略，需要Pacer模块在短时间内（至少15ms、5个包）按照设置的probing码率发送一系列探测报文，CC模块根据发送、接收码率来估计带宽。Probe的原理这里不多介绍，我们只需要了解pacer如何按照需要探测的带宽发送probing报文即可。

Probing的控制由`BitrateProber`类实现，该类只管发送，不管probe包的确认。probing是以cluster（簇）进行的，一个cluster记作一次完整的probing，每一个cluster有一个cluster id，该id自增。Probe有几个状态：
* Disabled，probing被禁用，处于Disable状态则无法触发Probing
* Inactive，开启probing，等待进来的包触发
* Active，当前正在probe，未发送足够的数据，probe cluster未结束
* Suspend，probe处于暂停状态

Probing的状态机：
* 创建probe cluster的时候，状态为Inactive。
* Inactive的时候，当前存在probe cluster，进来一个符合probe条件的包，触发Probe，进入Active状态
* probe cluster为空的时候进入Suspend状态

在Pacer的定时调度里面，完成了Probing的处理：
* 当前如果处于probing状态，（`BitrateProber`状态为Active），则获取probe cluster信息
* probing状态下发送的包，都算做probe cluster的部分
* probing状态为了维持发送码率，需要根据`BitrateProber`修改pacer定时器的调度时间，确保发送码率贴近设置的probing码率
* 发送probing直至时间&数据足够：时长超过15ms、包个数大于5个，足够则移除probe cluster，进入Suspended状态

如何确定下一次发送probe报文的时间？这里的原则是probe的实际码率总是接近设置的probe码率。因此下一次probe的时间为      `probe_start + 发送字节数/probe码率`：
```cpp
Timestamp BitrateProber::CalculateNextProbeTime(
    const ProbeCluster& cluster) const {
  // Compute the time delta from the cluster start to ensure probe bitrate stays
  // close to the target bitrate. Result is in milliseconds.
  DataSize sent_bytes = DataSize::Bytes(cluster.sent_bytes);
  DataRate send_bitrate =
      DataRate::BitsPerSec(cluster.pace_info.send_bitrate_bps);
  TimeDelta delta = sent_bytes / send_bitrate;
  return cluster.started_at + delta;
}
```

# 5. 总结
Pacer的原理讲的差不多了，总的来说，Pacer的平滑发送就是按照流、报文优先级，遵循平均发送码率轮询调度，实现了发送码率的平稳，同时兼任了padding和probing部分功能。主体逻辑大致如上，部分细节还需要读者们认真阅读源码，亲手实践。
