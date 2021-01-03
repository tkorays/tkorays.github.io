---
layout: post
title: WebRTC Stats API代码解读
---
> tkorays: 未经同意，不得转载。

在WebRTC中，我们需要对当前的音视频情况进行监控，便于对音视频质量有一个了解，同时可以用来分析定位音视频卡顿模糊等问题。对此，WebRTC提供了一个解决方案的标准，具体见标准：
[Identifiers for WebRTC's Statistics API](https://w3c.github.io/webrtc-stats/)

该标准定义了用于统计的类的层次结构以及必需字段，最上层代码的定义（如js定义）是参考这个标准来实现的。本文将介绍WebRTC Stats的native实现原理，希望大家对统计的实现有一个大致了解，读完本文后能够自己添加统计字段。

# 1. 基础类：RTCStatsMember和RTCStats
统计相关的接口定义位于`src/api/stats`，这个文件夹内主要包含几个统计相关的类，下面将一一介绍：

`RTCStatsMember`是一个模板类，继承了`RTCStatsMemberInterface`，这里的每一个`RTCStatsMember`表示一条原子的统计数据，如当前发送码率、接收码率。`RTCStatsMemberInterface`中定义了有效的统计数据类型，它还提供了json序列化的定义：
```cpp
class RTCStatsMemberInterface {
 public:
  // Member value types.
  // 一般只能用这些类型
  enum Type {
    kBool,    // bool
    kInt32,   // int32_t
    kUint32,  // uint32_t
    kInt64,   // int64_t
    kUint64,  // uint64_t
    kDouble,  // double
    kString,  // std::string

    kSequenceBool,    // std::vector<bool>
    kSequenceInt32,   // std::vector<int32_t>
    kSequenceUint32,  // std::vector<uint32_t>
    kSequenceInt64,   // std::vector<int64_t>
    kSequenceUint64,  // std::vector<uint64_t>
    kSequenceDouble,  // std::vector<double>
    kSequenceString,  // std::vector<std::string>
  };

  virtual ~RTCStatsMemberInterface() {}

  // 字段名称，序列化用到
  const char* name() const { return name_; }
  virtual Type type() const = 0;
  virtual bool is_sequence() const = 0;
  virtual bool is_string() const = 0;
  bool is_defined() const { return is_defined_; }
  // Is this part of the stats spec? Used so that chromium can easily filter
  // out anything unstandardized.
  virtual bool is_standardized() const = 0;
  // Non-standard stats members can have group IDs in order to be exposed in
  // JavaScript through experiments. Standardized stats have no group IDs.
  virtual std::vector<NonStandardGroupId> group_ids() const { return {}; }
  // Type and value comparator. The names are not compared. These operators are
  // exposed for testing.
  virtual bool operator==(const RTCStatsMemberInterface& other) const = 0;
  bool operator!=(const RTCStatsMemberInterface& other) const {
    return !(*this == other);
  }
  virtual std::string ValueToString() const = 0;
  virtual std::string ValueToJson() const = 0;

  template <typename T>
  const T& cast_to() const {
    RTC_DCHECK_EQ(type(), T::StaticType());
    return static_cast<const T&>(*this);
  }

 protected:
  RTCStatsMemberInterface(const char* name, bool is_defined)
      : name_(name), is_defined_(is_defined) {}

  const char* const name_;
  bool is_defined_;
};


template <typename T>
class RTCStatsMember : public RTCStatsMemberInterface {
   ...
};
```

`RTCStatsMember`有两个重要属性：
* 描述数据唯一标识的名称，如recv_bitrate，这个在序列化中非常重要，可实现后续的自动序列化；
* 数据字段。

`RTCStats`是基本统计的集合，如表示一个stream的统计数据，因此它有一个标识其含义的名称 。RTCStats里面包含了多个`RTCStatsMember`，rtcstats_objects.h中定义了所有的统计， 这里举一个简单的例子：
```cpp
// rtcstats_object.h
class RTC_EXPORT RTCCodecStats final : public RTCStats {
 public:
  WEBRTC_RTCSTATS_DECL();

  RTCCodecStats(const std::string& id, int64_t timestamp_us);
  RTCCodecStats(std::string&& id, int64_t timestamp_us);
  RTCCodecStats(const RTCCodecStats& other);
  ~RTCCodecStats() override;

  RTCStatsMember<uint32_t> payload_type;
  RTCStatsMember<std::string> mime_type;
  RTCStatsMember<uint32_t> clock_rate;
  RTCStatsMember<uint32_t> channels;
  RTCStatsMember<std::string> sdp_fmtp_line;
};

// rtcstats_object.cc
// clang-format off
WEBRTC_RTCSTATS_IMPL(RTCCodecStats, RTCStats, "codec",
    &payload_type,
    &mime_type,
    &clock_rate,
    &channels,
    &sdp_fmtp_line)
// clang-format on

RTCCodecStats::RTCCodecStats(const std::string& id, int64_t timestamp_us)
    : RTCCodecStats(std::string(id), timestamp_us) {}

RTCCodecStats::RTCCodecStats(std::string&& id, int64_t timestamp_us)
    : RTCStats(std::move(id), timestamp_us),
      payload_type("payloadType"),
      mime_type("mimeType"),
      clock_rate("clockRate"),
      channels("channels"),
      sdp_fmtp_line("sdpFmtpLine") {}

RTCCodecStats::RTCCodecStats(const RTCCodecStats& other)
    : RTCStats(other.id(), other.timestamp_us()),
      payload_type(other.payload_type),
      mime_type(other.mime_type),
      clock_rate(other.clock_rate),
      channels(other.channels),
      sdp_fmtp_line(other.sdp_fmtp_line) {}
```

`RTCCodecStats`是一个新的统计对象，继承了`RTCStats`。这个统计对象里面包含了payload_type等统计数据， 他们具有不同的统计类型，使用`RTCStatsMember`模板来描述，其构造函数中需要对每个字段赋予名称。

为了能够从RTCCodecStats中了解其所有成员来做自动序列化，这里通过WEBRTC_RTCSTATS_DEC和 WEBRTC_RTCSTATS_IMPL实现了一个自省的机制， 原理也很简单，就是在stats定义中，手动地将所有字段加到列表中，为了简单，这里用宏简化了代码：
```cpp
// 定义了一个函数，可以获取它和他的父类的RTCStatsMember对象指针
// 这样可以实现一个简单的"自省"机制
#define WEBRTC_RTCSTATS_DECL()                                          \
 protected:                                                             \
  std::vector<const webrtc::RTCStatsMemberInterface*>                   \
  MembersOfThisObjectAndAncestors(size_t local_var_additional_capacity) \
      const override;                                                   \
                                                                        \
 public:                                                                \
  static const char kType[];                                            \
                                                                        \
  std::unique_ptr<webrtc::RTCStats> copy() const override;              \
  const char* type() const override
```

有了这个自省机制，就可以直接从stats对象中获取所有字段，自动做序列化了。

# 2. stats集合：RTCStatsReport
RTCStatsReport是RTCStats的集合 。它作为对外的接口，所有的统计都封装在这个类中上报，使用这个统一的RTCStatsReport类取上报而不是一个抽象的RTCStats，我觉得其原因是：减少上报接口调用次数。

所有的stats以map形式保存，其名称是独一无二的，唯一标识一个RTCStats的，RTCStatsReport::GetAs可以根据name来获取stats：
```cpp
typedef std::map<std::string, std::unique_ptr<const RTCStats>> StatsMap;

template <typename T>
  const T* GetAs(const std::string& id) const {
    const RTCStats* stats = Get(id);
    if (!stats || stats->type() != T::kType) {
      return nullptr;
    }
    return &stats->cast_to<const T>();
  }
```

添加一条数据：
```cpp
void RTCStatsReport::AddStats(std::unique_ptr<const RTCStats> stats) {
  auto result =
      stats_.insert(std::make_pair(std::string(stats->id()), std::move(stats)));
  RTC_DCHECK(result.second)
      << "A stats object with ID " << result.first->second->id()
      << " is already "
         "present in this stats report.";
}
```

# 3. 上报回调：RTCStatsCollectorCallback
外部需要实现RTCStatsCollectorCallback这个接口，并注册下来，才能获取到统计数据RTCStatsReport。
```cpp 
class RTCStatsCollectorCallback : public virtual rtc::RefCountInterface {
 public:
  ~RTCStatsCollectorCallback() override = default;

  virtual void OnStatsDelivered(
      const rtc::scoped_refptr<const RTCStatsReport>& report) = 0;
};
```

# 4. 上报数据：见rtcstats_object.h

标准中定义了上报数据字段，主要有：
* RTCCertificateStats
* RTCCodecStats
* RTCDataChannelStats
* RTCIceCandidatePairStats
* RTCIceCandidateStats
* RTCLocalIceCandidateStats
* RTCRemoteIceCandidateStats
* RTCMediaStreamStats
* RTCMediaStreamTrackStats
* RTCPeerConnectionStats
* RTCRTPStreamStats
* RTCInboundRTPStreamStats
* RTCOutboundRTPStreamStats
* RTCRemoteInboundRtpStreamStats
* RTCMediaSourceStats
* RTCAudioSourceStats
* RTCVideoSourceStats
* RTCTransportStats
统计的含义以及字段含义见标准文档，如果发现没有的字段，可以参考`rtcstats_object.h`自己添加。 


