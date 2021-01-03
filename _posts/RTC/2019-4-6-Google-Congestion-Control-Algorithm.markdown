---
layout: post
title: Google Congestion Control Algorithm
---

> tkorays: 未经同意，不得转载。
> 重构中……尚未完成

网络拥塞（Congestion）是通信中绕不过的一个问题，在实时音视频通信开发中占据了比较重要的位置。在音视频中出现的大多数网络问题都可以建模为拥塞，虽然他们表现不太一致，但是实际上都是不同拥塞现象的表现。目前在RTC中，关注最多的拥塞控制方法当属GCC（Google Congestion Control），这也是WebRTC中默认的拥塞控制方法。下面将结合下自己的理解，介绍下GCC算法。

# 1. 拥塞控制介绍
在介绍拥塞控制(Congestion Control)之前，必须要了解什么是拥塞(Congestion)。

我们都知道网络链路是一种共享的、有限资源，这些资源一般我们可以简单认为是路由器、交换机等的缓存（buffer）或者说是内存，因为链路中资源是有限的，因此在链路过载（overload/overuse）的时候，就不可避免地导致缓存太多数据导致传输延迟增加，一旦过载超过阈值就会出现丢包。在早期的网络中，因为没有拥塞控制，很容易出现拥塞崩溃。

## 1.1 拥塞控制历史介绍
我们知道WebRTC里面音视频传输采用的是UDP协议，因此GCC也是基于UDP协议的，我们在谈到GCC协议的时候，总是会想到TCP的拥塞控制，事实上GCC不是凭空产生的，它也是从TCP的拥塞控制协议发展而来。因此，这里简单介绍一下TCP的拥塞控制方法。

拥塞控制的发展是随着人们对拥塞的深入理解而出现更多的方法。一开始，网络设备的内存都比较小，过载后很容易出发丢包，因此大家把丢包当做拥塞的信号，一旦出现丢包即认为是拥塞，需要降低发送码率。但是，随着技术发展，路由器、交换机的内存越来越大，缓存的数据也越来越多，拥塞的时候并不会先发生丢包，拥塞会导致缓存数据越来越多，因此一般都是延迟越来越大，最后才出现丢包，这个时候并不能用丢包作为拥塞的信号了。为了检测这种延迟，先后出现了基于双向延迟（RTT）、单向延迟等方法。关于拥塞的原理，建议大家去了解下路由器的队列管理（Queue Management），它会让你对拥塞有新的认识。

综上，可以提炼出主要的两个拥塞控制方法：`基于丢包的拥塞控制`和`基于延迟的拥塞控制`，GCC的拥塞控制正是基于这两个思想。当然，GCC的方法是不是就是银弹？显然他不是的，GCC并不能解决所有的问题，所以后面大家才越来越关注BBR和PCC。

## 1.2 GCC原理总结
GCC算法的核心在于，根据丢包和单向延迟分别估计出带宽，编码器根据估计带宽调整编码码率，pacer根据估计带宽平滑发送数据，通过这种方式从源端控制，避免发送过多数据导致网络出现拥塞。

目前，GCC的拥塞控制都是运行在发送端，（老版本的基于延迟的拥塞控制运行在接收端，通过REMB反馈估计带宽，这个方法这里不作太多介绍），通过RTCP RR报文获取loss，通过TCC（Transport Wide Congestion Control）机制在发送端运行基于延迟的拥塞控制，最终得到两个估计带宽，综合取小后即是最终的估计带宽。

# 2. GCC工作原理
目前的WebRTC里面的GCC都是运行在发送端，下面将介绍基于延迟的带宽估计和基于丢包的带宽估计。老版本的使用kalman滤波做拥塞检测的这里不再做介绍，主要介绍基于趋势滤波器的方式。
## 2.1 基于延迟(delay based)的带宽估计
delay based拥塞控制包含几个部分：
* `InterArrival`：以包组方式计算包组间相对延迟
* `TrendlineEstimator`：继承自`DelayIncreaseDetectorInterface`，检测延迟增加判断是否处于overuse/underuse
* `AimdRateControl`：实现了`AIMD`，即underuse的时候线性增加估计带宽，overuse的时候乘性降低

这里需要在发送端获取接收报文的单向延迟信息，因此需要在接收端将报文的接收时间反馈到发送端，这个通过TCC feedback机制来实现。下面将重点介绍TCC以及这几个拥塞控制模块的作用。
### 2.1.1 TCC（Transport-wide Congestion Control）
发送端的delay based拥塞控制都是建立在TCC的基础上的。

transport wide sequence number和Transport wide Feedback分别对应RTP和RTP扩展，以下简称TCC seq和TCC feedback，其标准见[Transport-wide Congestion Control](https://datatracker.ietf.org/doc/html/draft-holmer-rmcat-transport-wide-cc-extensions-01)。
* TCC seq是一个RTP扩展，他给同一个rtp bundle内的所有流打上一个连续的sequence number，实现了传输范围（transport wide）的拥塞控制
* TCC feedback是一个RTCP扩展，它在接收端记录所有TCC报文的接收时间，并将TCC seq和其接收时间反馈到发送端。

通过TCC，我们便可以在发送端获取到报文的单向延迟，这样便可以在发送端做基于延迟的拥塞控制。发送端对于发送的报文都会记录其seq和发送时间，这些seq在收到其TCC feedback确认后，编可以送到`InterArrival`去做延迟的估计。

### 2.1.2 InterArrival:基于包组的延迟估计
计算相对延迟的时候，不是按照逐包计算，而是以包组（Packet Group）的方式。对于包组技术的介绍，可以看看google给的解释：[Making Google Congestion Control robust over Wi-Fi networks using packet grouping](https://irtf.org/anrw/2016/anrw16-final14.pdf)。简单点说，就是像wifi这种信道，会因为各种原因会存在短暂的信道中断（outage），带来的现象是报文会在路由器上聚集后同时到达接收端，同时我们的pacer 5ms调度一次也会瞬间有多个报文同时发送出去。这种报文聚集想现象导致以单个包为单位计算相对延迟不是很准确，因此，这里才会以包组的聚合方式，这样相对来说能够得到更准确的结果。

相对延迟的计算，相对大家都比较清楚了，即相邻两组包的接收时间差减去发送时间差。如果报文大小相等、网络良好，那么相对延迟是0.如果网络出现拥塞，报文在网络中被延迟，因此这个相对延迟会会增加。

$$
d_i = (t_i - t_{i-1}) - (T_i - T_{i-1})
$$

`InterArrival`重点关注怎么去划分包组：。
* 一般而言，距离当前group的第一个包发送时间超过5ms，则开始新的分组。因为发送端的聚集一般是由于pacer的调度间隔，一般不存在较大的其他的聚集情况
* 如果当前包相对于当前group是burst，则仍划分到当前分组中，这就是上面所说道的包组（packet group）的核心。
* 同一时间发送的数据，一定是属于同一个分组，这其实是发送端burst

wifi环境突然出现的outage会导致这个现象，一段时间内所有的包聚集到达，相对上一个包的传输延迟`di < 0`，即发送时间差小于接收时间差。burst的完整条件是：传输延迟小于0、距离上个包接收时间小于5ms、分组的接收时间跨度小于100ms。此处贴下代码，可以让大家加深下理解：

```cpp
bool InterArrival::BelongsToBurst(int64_t arrival_time_ms,
                                  uint32_t timestamp) const {
  if (!burst_grouping_) {
    return false;
  }
  int64_t arrival_time_delta_ms =
      arrival_time_ms - current_timestamp_group_.complete_time_ms;
  uint32_t timestamp_diff = timestamp - current_timestamp_group_.timestamp;
  int64_t ts_delta_ms = timestamp_to_ms_coeff_ * timestamp_diff + 0.5;
  // 统一时间发送，发送端burst
  if (ts_delta_ms == 0)
    return true;
  // 传播延迟因为这当前包相对于上个包在网络传输上的延迟增量，为负标识提前到达，一般是包组聚集的表现
  int propagation_delta_ms = arrival_time_delta_ms - ts_delta_ms;
  // 接收存在聚集 & 到达时间delta小于5ms & 分组跨度不超过100ms
  if (propagation_delta_ms < 0 &&
      arrival_time_delta_ms <= kBurstDeltaThresholdMs &&
      arrival_time_ms - current_timestamp_group_.first_arrival_ms <
          kMaxBurstDurationMs)
    return true;
  return false;
}
```

包组分明后，便可以以包组为单位计算包组之间的相对延迟。`InterArrival`的输出包括：
* 包组是否完成，是否需要计算delta信息
* 前后两个包组的发送时间差（以timestamp为单位，*包组发送时间取第一个发送包的时间*）
* 前后两个包组的接收时间差（以ms为单位，*包组的接收时间取包组最后一个接收包的时间*）
* 前后两个包组的总字节数差

输出的这些信息用于Trendline Filter估计延迟的趋势，并通过趋势来判断当前是否拥塞。

### 2.1.3 Trendline Filter
不同于老版本的WebRTC，新版本的WebRTC将延迟的带宽估计放在了发送端，并通过Trendline Filter估计单向延迟的趋势，拿这个趋势和阈值比较确定当前是否出现拥塞。

Trendline使用了最小二乘法拟合一条直线，`y = kx + b`，即随着时间变化，相对延迟是否成上升趋势，趋势通过拟合的直线斜率描述。具体的做法：
* 计算两个包组的相对时间差（包组的接收时间差 - 包组的发送时间差），并对这个delta做一个平滑，这个平滑后的数据被称作smoothed_delay。

$$
accumulated\_delay += delta\_ms  \\
smoothed\_delay = coef * smoothed\_delay + (1 -  coef) * accumulated\_delay
$$

* 最小二乘法拟合直线斜率，这里x就是接收时间，y是上面的smoothed_delay，这里的k即趋势trend，代码就不贴了，公式已经很清晰：

$$
\bar{x} = (\sum_{i}{x}) / N \\
\bar{y} = (\sum_{i}{y}) / N \\
k = \frac{\sum_{i}{(y_i - \bar{y})(x_i - \bar{x})}}{\sum_{i}{(x_i - \bar{x})^2}}
$$

* 将trend和阈值比较，返回当前的状态overuse/underuse/normal
> * 拥塞的时候k值可能比较小，不能明显地体现出来，因此需要做一个增益：`min(num_of_deltas, 60)*trend*gain`，增益一般为4，初始阶段最终增益随着delta个数增加，后续判断都是拿这个做完增益后的trend去比较
> * 比较的阈值为初始为T=12.5，简单点说，超过阈值T就是overuse，低于阈值-T就是underuse，在这之间都是normal
> * 但是为了抗抖动，overuse的除法需要谨慎，限制overuse的时间（10ms）和次数超过阈值（1次）后，才算一次overuse。
> * overuse和underuse的阈值不是一致不变的，如果当前的trend距离阈值比较远的时候需要适当调整阈值，避免阈值钝化。这里上调和下调的参数不同，上调慢，下调快。详见`TrendlineEstimator::UpdateThreshold`。


### 2.1.4 AimdRateControl
Trendline的输出为三个状态：`Overusing`、`Underusing`、`Normal`。overuse的时候表示拥塞需要降低带宽，非overuse的时候需要增加带宽，增加和降低遵循AIMD原则，即线性增加乘性降低。

AIMD有三个状态，分别为Increase、Decrease、Hold。状态转换图如下：

<img src="/public/post/img/gcc-state.png" style="width: 300px;margin:auto auto;"/>

Hold不用多解释，即保持当前带宽不变。下面介绍下Increase和Decrease。

## 2.2 基于丢包（loss based）的带宽估计


## 2.3 带宽估计汇总


# 3. 总结


这个算法先估计带宽，再按照指定带宽发送码流。实现带宽算法有两种方法：

* 基于丢包的控制器和基于时延的控制器都运行在发送端
* 基于时延的控制器运行在接收端，基于丢包的控制器运行在发送端

### 2.1 带宽估计方法1
这种方法的两个控制器都运行在发送端，因此发送端需要知道丢包、环路时延、单路时延信息。我们知道接收端收到报文后算出丢包率、环路时延可以通过RTCP RR反馈给发送端，因此丢包率发送端是知道的。需要注意，这里需要的是单路时延(one way delay) 而不是环路时延(round-trip delay)，因此并不能直接将RTCP报文里面的RTT输入到基于时延的控制器。

因此GCC提出了一种per-packet protocol，在通话前通过SDP协商支持google REMB(Receiver Estimated Maximum Bitrate) feedback：

```
a=rtcp-fb:100 goog-remb
```

RTP接收端记录下报文接收时间和传输层序号，并使用RTCP feedback报文反馈给发送端。通常反馈是视频接收一帧发送一次，如果需要控制，可以增大发送间隔至100ms。

发送端收到FB报文后，可以获取{序号,接收时间数据}，将其输入基于时延的控制器。同时利用序号也可以计算丢包。

这样，两个控制器都可以运行在发送端，接收端根据这两个控制器估算出带宽。

### 2.2 带宽估计方法2
方法2，基于时延的控制器运行在接收端，是直接在接收端计算时延，并不断通过RTCP feedback报文将估计的带宽反馈给发送端。

GCC中使用了`RTP扩展头`携带报文发送时间abs-send-time来实现，接收端将绝对发送时间以及接收时间输入基于时延的控制器，最终输出带宽。发送端再将带宽通过`RTCP REMB`消息反馈给对端（其实也可以用`RTCP TMMBR`消息反馈带宽，见RTP AVPF）。最终接收端反馈的带宽、SR反馈的丢包和环路时延被输入发送端的基于丢包的控制器，最后输出目标带宽。

<img src="/public/post/img/gcc-sender-side.png" style="width: 500px;margin:auto auto;"/>

如果接收端没有实现RTCP FB来通过REMB或TMMBR反馈时延，也不会处理RTP扩展头，那么可以只在发送端运行基于丢包的控制器，直接利用RTCP反馈的丢包和环路时延评估带宽。

### 2.3 发送引擎
在计算完带宽后，发送端需要按照一定节奏发送报文。通常会创建一个节奏器队列（pacer queue），节奏器每隔burst_time（推荐值为5ms）向网路中发送报文，一组报文限制大小可以通过以下公式计算：

$$
group\_size = burst\_time*bitrate
$$

## 3. 基于时延的控制
基于时延的控制器可以被分解为四个部分： `预滤波`、`到达时间滤波器`、`过载检测器`、`码率控制器`。

### 3.1 到达时间模型
这个章节描述了一个滤波器，可以根据接收包组的时间连续地调整估计参数。这里定义了一个`接收时间间隔`：$$ t_i - t_{i-1} $$，即两个包组到达时间之差，相应地$$ T_i - T_{i-1} $$表示两个发送包组时间之差，即`发送时间间隔`。两个时间差相减得到单路时延差： 

$$ 
d_i = (t_i - t_{i-1}) - (T_i - T{i-1}) 
$$

接收时间$$ t_i $$表示的是一组包中的最后一个包接收的时间。如果当前包组相对之前的包组满足$$ t_i - t_{i-1} \gt T_i - T{i-1} $$，那说明当前包组相对之前的一个包组存在延迟。
在这个模型中，任何乱序的包都需要被丢弃。

下面我们对此包组之间的时延差$$ d_i $$进行建模：

$$
d_i = w_i
$$

其中$$ w_i $$是随机过程W的采样，它是链路能力、当前交叉网络、发送码率的函数。我们将W建模为白高斯随机过程`white Gaussian process`。如果通道被过度使用，通道出现拥塞，报文抖动增加，明显$$w_i$$的平均值会增加；如果网络路径上被清空后，$$w_i$$会降低；否则$$w_i$$保持不变。

我们将平均值$$ m_i $$从$$ d_i $$中分离出来：

$$
d_i = m_i + v_i
$$

其中$$ v_i $$表示网络抖动和其他未被模型捕获到的时延影响。

### 3.2 预滤波
预滤波旨在处理由于通道中断引起的短暂延时。当网络通道中断时，报文被放进缓冲队列，等到网络中断结束后，所有的报文一瞬间被转发。因此这里的做法是`将突发包合并成一组`，通过这个预滤波估计是否存在短暂的延时。

预滤波将突发包合并成一个组，需要满足以下任一条件：

* 一系列包在`burst_time`（见发送引擎中对此的描述）时间内一起被发送，组成一个组。
* 一个包在`burst_time`内被收到，包间时延变化$$d_i \lt 0$$，那么就认为是属于当前一组包。

### 3.3 到达时间滤波器
$$d_i$$我们可以很很容易通过包组时间得到，但是我们更希望能估计平均值$$m_i$$，并用它来评估当前受限链路是否过载。这个参数可以通过任何自适应滤波器得到，这里使用的是`卡尔曼滤波器Kalman filter`。因此下面将介绍如何使用卡尔曼滤波器，动态地估计平均值$$m_i$$。

假设i到i+1有如下的状态转换：

$$
m_{i+1} = m_i + u_i
$$

这里$$u_i$$是符合高斯随机过程的状态噪声，其均值为0，方差为：

$$
q_i = E[u_i^2]
$$

$$q_i$$推荐使用$$10^{-3}$$。


因此$$d_i = m_i + v_i$$对应卡尔曼滤波器中的观测值，方差为$$E[v_i^2]$$；$$m_{i+1} = m_i + u_i$$对应卡尔曼滤波器中的估计值，方差为$$E[u_i^2]$$。

卡尔曼滤波器递归地更新$$m_i$$的估计$$\bar{m}_i$$:

$$
z_i = d_i - \bar{m}_{i-1} \\
\bar{m}_i = \bar{m}_{i-1} + z_ik_i \\
k_i = (e_{i-1} + q_i)/(E[v_i^2] + (e_{i-1} + q_i)) \\
e_i = (1 - k_i * (e_{i-1} + q_i))
$$

其中$$k_i$$是卡尔曼增益，$$v_i$$的方差$$E[v_i^2]$$通过指数平均滤波器来估计:

$$
\bar{E}[v_i^2] = max(\alpha*E[v_{i-1}^2] + (1 - \alpha)*z_i^2, 1) \\
\alpha = (1-chi)^{30/(1000*f_{max})}
$$

其中，

$$
f_{max} = max[1/(T_j - T_{j-1})], j = i-K+1,...,i
$$

它是前K个收到的包组的最大码率。

chi是滤波器参数，范围[0.1, 0.001]。

如果$$z_i \gt 3sqrt(\bar{E}[v_i^2]) $$，使用$$z_i = 3sqrt(\bar{E}[v_i^2])$$来更新$$z_i$$。因为此时发包超出了通道限制，$$v_i$$不一定是一个高斯白噪声了。

通过卡尔曼滤波，我们可以比较准确地估计单向时延，用于评估当前链路是否过载。

### 3.4 过载检测器
通过上面的到达时间滤波器我们可以估算出时延差的平均值$$m_i$$，如何通过它判断当前链路是否过载呢？

将它和阈值$$Th$$比较，如果超过阈值则认为链路过载。一般不会仅仅检测出一次就认为是过载，需要持续一段时间$$T_{overuse}$$。如果$$m_i < m_{i-1}$$，即使$$m_i$$超过阈值一段时间，那么也不能认为是过载。同样，如果$$m_i < -Th$$，则认为是低载。如果既没有过载也没有低载，则是普通状态。

静态的阈值$$Th$$并不是一个很好的选择，通常会因为同时存在的TCP流而导致饥饿（starvation）。

<img src="/public/post/img/gcc-starve.png" style="width: 300px;margin:auto auto;"/>

为什么会出现这种情况呢？因为过小的阈值导致算法对$$m_i$$的变化很敏感，导致算法频繁地检测到过载信号，因此`基于时延的控制器`会因为这个时延变化不断减小评估的带宽。而`TCP是基于丢包(loss based)的流`，此时和TCP流竞争会导致自己饥饿。因此动态地调整过载阈值以达到最佳效果很有必要，下面将介绍如何动态地调整这个阈值。

$$
Th_i = Th_{i-1} + (t_i - t_{i-1})*K_i*(|m_i|*-Th_{i-1})
$$

其中，$$K_i=K_d$$，如果$$ \|m_i\| < Th_{i-1} $$，否则$$K_i=K_u$$。从这个式子看出，当$$m_i$$超过范围$$[-Th_{i-1}, Th_{i-1}]$$时，阈值需要增加；相反$$m_i$$跌落至这个范围，则阈值减小。

因此，当TCP流进入同样的瓶颈时，$$m_i$$会超出范围，此时阈值会增加，可以避免频繁产生过载信号。

如果一直满足$$\|m_i\| - Th_i > 15$$，此时抖动较大，不建议更新阈值$$Th$$。而$$Th_i$$建议范围为$$[6, 600]$$，太小的值会导致算法比较敏感。建议$$K_u \gt K_d$$，这样阈值可以`快升慢降`。以下是算法建议值：

$$
Th_0 = 12.5ms \\
T_{overuse} = 10ms \\
K_u = 0.01 \\
K_d = 0.00018
$$

### 3.5 码率控制
码率控制分为两个部分，一个是基于时延控制带宽估计，另一个是根据丢包控制。这两个控制的的目的都是为了更准确地估计带宽，使其能够和传输通道带宽匹配，并检测出拥塞。

当检测出过载时，基于时延的控制器评估的带宽会减小。

码率控制子系统会按照常数周期去执行带宽估计，它有3个状态：increase、decrease、hold。increase表明系统没有检测到拥塞，可以增大带宽；decrease表示系统检测到拥塞，需要减小带宽；hold状态会一直等待，直到需要增大带宽进入increase状态。其状态转换如下，空白表示保持当前状态：

|信号\当前状态|hold|increase|decrease|
|---|---|---|---|
|过载|decrease|decrease|-|
|正常|increase|-|hold|
|低载|-|hold|hold|

状态转换图如下：

<img src="/public/post/img/gcc-state.png" style="width: 300px;margin:auto auto;"/>

子系统最开始处于increase状态，直至检测到过载或者低载。增加按照倍数还是增加常数值的方式取决于当前状态。如果当前带宽和目标带宽相差很大，则使用倍数增加方式；如果很接近目标带宽则使用常数增加。

接收的带宽根据Ts的时间窗计算：

$$
\bar{R}_i = 1/T * \sum{L_j}, j = 1,...,N_i
$$

其中$$N_i$$表示上次T时间内收到的包个数，$$L_j$$表示第j个包的净荷大小。

当处于倍数增加中，估计带宽$$\bar{A}_i$$每秒增加8%：

$$
eta = 1.08^{min(time\_since\_last\_update\_ms / 1000, 1.0)} \\
\bar{A}_i = eta * \bar{A}_{i-1}
$$

当处于常数增加中，估计值每个响应时间增加最多半个包大小，响应时间间隔response_time_ms用环路时延RTT+100ms来估计，作为过载的预测和检测响应时间：

$$
response\_time\_ms = 100 + rtt_ms \\
\alpha = 0.5 * min(time\_since\_last\_update\_ms / response\_time\_ms, 1.0) \\
\bar{A}_i = \bar{A}_{i-1} + max(1000, \alpha * expected\_packet\_size\_bits)
$$

低带宽下，expected_packet_size_bits具有更缓慢的倾斜。假设当前帧率30，每帧1200字节，可以估计：

$$
avg\_packet\_size\_bits = \bar{A}_{i-1} / (30*1200*8)
$$


这个系统以来对通道过载来估计可用带宽，我们必须保证估计的带宽和当前发送带宽不能差太大，因此有以下的限制：

$$
\bar{A}_i \lt 1.5*\bar{R}_i
$$


当检测到过载时，系统需要转换到descrease状态，基于时延的带宽估计会将当前的带宽减少factor：

$$
\bar{A}_i = \beta*\bar{R}_i
$$

$$\beta$$取值范围： $$[0.8, 0.95]$$，建议使用0.85.

当检测到低载时，网络中的队列被清空，此时估计的可用带$$\bar{A}_i$$是低于实际可用带宽，于是当前子系统进入hold状态。而接收端可用带宽估计会持续保持（hold），等待队列稳定，保证延迟尽量小。

## 4. 基于丢包的控制
基于丢包的控制器根据环路时延RTT、丢包率、基于时延的控制器输出的带宽估计$$\bar{A}$$评估可用带宽，记为$$\bar{As}$$。

基于时延的控制器估算出来的可用带宽仅仅在网络路径上的缓存队列比较大的时候才比较可靠，如果缓存队列比较小，那么可以根据丢包来察觉是否过载。

* 如果从之前的报告中检测到2～10%的丢包，那么发送端的可用带宽$$\bar{As}_i$$保持不变。
* 如果丢包率超过10%，则$$\bar{As}_i = \bar{As}_{i-1}(1-0.5p)$$，其中p是丢包率
* 如果丢包率低于2%，那么带宽需要增加，$$\bar{As}_i = 1.05\bar{As}_{i-1}$$

基于丢包的估计和基于时间的估计会进行比较，最终取最小者：

$$
A_{final} = min\{\bar{As}, \bar{A}\}
$$


