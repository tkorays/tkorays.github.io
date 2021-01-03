---
layout: post
title: WebRTC日志模块
---

> tkorays: 未经同意，不得转载。

日水一篇。这里分析下webrtc日志模块的实现，方便后续可以借鉴他的实现。

# 1. 总体介绍
这里主要介绍webrtc的日志模块，从代码角度看看webrtc的log设计。我们平常直接使用RTC_LOG宏，是不是也想知道其背后实现？通过分析WebRTC的日志模块，可以学习其日志设计的思想。

可以先从调用顺序角度，对log模块有一个大致了解：
* RTC_LOG宏，我们在代码里面经常使用到的宏
* RTC_LOG_FILE_LINE宏，传入文件名和行号的输出
* LogCall，日志输出的最终控制，控制最终是否输出
* LogStreamer，日志流，它是日志流的灵魂，链式调用的关键，每一个输出字段都以LogStreamer存在，以链表形式保存，可以从后往前递归
* Log，日志输出函数，调用LogMessage完成字符拼接，格式控制等，这里使用可变参数模板和可变参数函数方式
* LogMessage，输出日志的实现，可以有多个全局的LogSink作为输出，用作Scoped变量，在析构的时候完成真正的写日志
* LogSink，真正的写日志实现。

这里提供了以下的日志级别：
```cpp
enum LoggingSeverity {
  LS_VERBOSE,
  LS_INFO,
  LS_WARNING,
  LS_ERROR,
  LS_NONE,
  INFO = LS_INFO,
  WARNING = LS_WARNING,
  LERROR = LS_ERROR
};
```
# 2. LogCall
LogCall这个类的作用在于控制logging是否开启，日志流通过const引用参数传入，我们完全可以修改这个实现，完全过滤掉所有输出。
```cpp
class LogCall final {
 public:
  // This can be any binary operator with precedence lower than <<.
  // We return bool here to be able properly remove logging if
  // RTC_DISABLE_LOGGING is defined.
  template <typename... Ts>
  RTC_FORCE_INLINE bool operator&(const LogStreamer<Ts...>& streamer) {
    streamer.Call();
    return true;
  }
};
```

代码内主要使用RTC_LOG_FILE_LINE宏来输出日志，LogStreamer作为参数输入到LogCall中： 
```cpp
#define RTC_LOG_FILE_LINE(sev, file, line)        \
  ::rtc::webrtc_logging_impl::LogCall() &         \
      ::rtc::webrtc_logging_impl::LogStreamer<>() \
          << ::rtc::webrtc_logging_impl::LogMetadata(file, line, sev)

#define RTC_LOG(sev)                        \
  !rtc::LogMessage::IsNoop<::rtc::sev>() && \
      RTC_LOG_FILE_LINE(::rtc::sev, __FILE__, __LINE__)
```
最终我们使用RTC_LOG这个宏来输出，如`RTC_LOG(INFO)<<"1234";`，从`RTC_LOG_FILE_LINE`中我们可以知道，如果`LogCall()`返回false，则不会执行流式输出。

# 3. LogStreamer
LogStreamer是一个日志流类，单条输出在这个流中保存。日志输出通过 << 串联。LogStreamer本身是一个模板，有不同的实现， RTC_LOG_FILE_LINE使用了其默认的实现：
```cpp
// Base case: Before the first << argument.
template <>
class LogStreamer<> final {
 public:
  template <typename U,
            typename V = decltype(MakeVal(std::declval<U>())),
            absl::enable_if_t<std::is_arithmetic<U>::value ||
                              std::is_enum<U>::value>* = nullptr>
  RTC_FORCE_INLINE LogStreamer<V> operator<<(U arg) const {
    return LogStreamer<V>(MakeVal(arg), this);
  }

  template <typename U,
            typename V = decltype(MakeVal(std::declval<U>())),
            absl::enable_if_t<!std::is_arithmetic<U>::value &&
                              !std::is_enum<U>::value>* = nullptr>
  RTC_FORCE_INLINE LogStreamer<V> operator<<(const U& arg) const {
    return LogStreamer<V>(MakeVal(arg), this);
  }

  template <typename... Us>
  RTC_FORCE_INLINE static void Call(const Us&... args) {
    static constexpr LogArgType t[] = {Us::Type()..., LogArgType::kEnd};
    Log(t, args.GetVal()...);
  }
};
```

在执行RTC_LOG(INFO)<<"1234"; 的开始，先创建一个`LogStreamer<>`对象，这是链式调用中的head，也是链式回溯中最后负责组装字符串的tail。链式调用后续输入参数都会创建一个新的对象（根据模板参数实例化一个模板），并将打印的信息以及当前LogStreamer作为参数传入到下一个LogStreamer对象，具体实现见`LogStreamer<V>operator<<(U arg) const`成员函数以及LogStreamer的构造函数。 
`RTC_LOG(INFO)<<"1234"`; 里面的"1234"会通过以下模板生成一个新的对象LogStreamer<std::string>，传入上一个LogStreamer和“1234”参数。模板如下：
```cpp
// Inductive case: We've already seen at least one << argument. The most recent
// one had type `T`, and the earlier ones had types `Ts`.
template <typename T, typename... Ts>
class LogStreamer<T, Ts...> final {
 public:
  RTC_FORCE_INLINE LogStreamer(T arg, const LogStreamer<Ts...>* prior)
      : arg_(arg), prior_(prior) {}

  template <typename U,
            typename V = decltype(MakeVal(std::declval<U>())),
            absl::enable_if_t<std::is_arithmetic<U>::value ||
                              std::is_enum<U>::value>* = nullptr>
  RTC_FORCE_INLINE LogStreamer<V, T, Ts...> operator<<(U arg) const {
    return LogStreamer<V, T, Ts...>(MakeVal(arg), this);
  }

  template <typename U,
            typename V = decltype(MakeVal(std::declval<U>())),
            absl::enable_if_t<!std::is_arithmetic<U>::value &&
                              !std::is_enum<U>::value>* = nullptr>
  RTC_FORCE_INLINE LogStreamer<V, T, Ts...> operator<<(const U& arg) const {
    return LogStreamer<V, T, Ts...>(MakeVal(arg), this);
  }

  template <typename... Us>
  RTC_FORCE_INLINE void Call(const Us&... args) const {
    prior_->Call(arg_, args...);
  }

 private:
  // The most recent argument.
  T arg_;

  // Earlier arguments.
  const LogStreamer<Ts...>* prior_;
};
```
通过上面的模板结构，我们看到一个指针const LogStreamer<Ts...>* prior_;，他可以将所有LogStreamer作为链表串起来，每一个LogStreamer（除了第一个） 都保存了前一个LogStreamer的指针，这便于后续日志输出时做遍历。可以见`LogStreamer::Call`函数，输出的信息保存在模板参数中，最终在第一个LogStreamer处完成真正的输出，再次摘抄如下：
```cpp
  template <typename... Us>
  RTC_FORCE_INLINE static void Call(const Us&... args) {
    static constexpr LogArgType t[] = {Us::Type()..., LogArgType::kEnd};
    Log(t, args.GetVal()...);
  }
```
这里将所有LogStreamer的参数作为模板参数，放到模板参数列表中。但是最终还是通过c语言的可变参数函数（c调用约定）来输出。
另外输出的变量在这里不是使用裸类型，而是稍作封装，见MakeVal。个人理解，这个应该是确保模板能正确匹配，对于字符串这些类型处理不会出错。 比较特殊的一个输出变量是LogMetaData，他主要包含了文件名、行号、日志级别信息。LogMetadata 是最后一个参数，见RTC_LOG_FILE_LINE，因此它也是第一个被递归输出的，见Log函数。
```cpp
class LogMetadata {
 public:
  LogMetadata(const char* file, int line, LoggingSeverity severity)
      : file_(file),
        line_and_sev_(static_cast<uint32_t>(line) << 3 | severity) {}
  LogMetadata() = default;

  const char* File() const { return file_; }
  int Line() const { return line_and_sev_ >> 3; }
  LoggingSeverity Severity() const {
    return static_cast<LoggingSeverity>(line_and_sev_ & 0x7);
  }

 private:
  const char* file_;

  // Line number and severity, the former in the most significant 29 bits, the
  // latter in the least significant 3 bits. (This is an optimization; since
  // both numbers are usually compile-time constants, this way we can load them
  // both with a single instruction.)
  uint32_t line_and_sev_;
};
```

第一个LogStreamer使用Log来输出日志，主要是可变参数处理，函数的第一个参数为输出的日志字段类型列表，后续为可变参数。下面主要是一些参数处理：

```cpp
void Log(const LogArgType* fmt, ...) {
  va_list args;
  va_start(args, fmt);

  LogMetadataErr meta;
  const char* tag = nullptr;
  switch (*fmt) {
    case LogArgType::kLogMetadata: {
        meta = {va_arg(args, LogMetadata), ERRCTX_NONE, 0};
        break;
    }
    case LogArgType::kLogMetadataErr: {
        meta = va_arg(args, LogMetadataErr);
        break;
    }
    #ifdef WEBRTC_ANDROID
    case LogArgType::kLogMetadataTag: {
        const LogMetadataTag tag_meta = va_arg(args, LogMetadataTag);
        meta = { {nullptr, 0, tag_meta.severity}, ERRCTX_NONE, 0};
        tag = tag_meta.tag;
        break;
    }
    #endif
    default: {
        RTC_NOTREACHED();
        va_end(args);
        return;
    }
  }

  LogMessage log_message(meta.meta.File(), meta.meta.Line(),
                         meta.meta.Severity(), meta.err_ctx, meta.err);
  if (tag) {
    log_message.AddTag(tag);
  }

  for (++fmt; *fmt != LogArgType::kEnd; ++fmt) {
    switch (*fmt) {
      case LogArgType::kInt:
        log_message.stream() << va_arg(args, int);
        break;
      case LogArgType::kLong:
        log_message.stream() << va_arg(args, long);
        break;
      case LogArgType::kLongLong:
        log_message.stream() << va_arg(args, long long);
        break;
      case LogArgType::kUInt:
        log_message.stream() << va_arg(args, unsigned);
        break;
      case LogArgType::kULong:
        log_message.stream() << va_arg(args, unsigned long);
        break;
      case LogArgType::kULongLong:
        log_message.stream() << va_arg(args, unsigned long long);
        break;
      case LogArgType::kDouble:
        log_message.stream() << va_arg(args, double);
        break;
      case LogArgType::kLongDouble:
        log_message.stream() << va_arg(args, long double);
        break;
      case LogArgType::kCharP: {
        const char* s = va_arg(args, const char*);
        log_message.stream() << (s ? s : "(null)");
        break;
      }
      case LogArgType::kStdString:
        log_message.stream() << *va_arg(args, const std::string*);
        break;
      case LogArgType::kStringView:
        log_message.stream() << *va_arg(args, const absl::string_view*);
        break;
      case LogArgType::kVoidP:
        log_message.stream() << rtc::ToHex(
            reinterpret_cast<uintptr_t>(va_arg(args, const void*)));
        break;
      default:
        RTC_NOTREACHED();
        va_end(args);
        return;
    }
  }

  va_end(args);
}
```
这里字符串拼接使用了LogMessage里面定义的StringBuilder。

# 4. LogMessage
LogStreamer完成递归后，使用LogMessage写日志。LogMessage中调用LogSink写日志。

LogSink一般由更上层实现，是具体日志写文件或写命令行的实现，用户有很大的定制自由度：
```cpp
// Virtual sink interface that can receive log messages.
class LogSink {
 public:
  LogSink() {}
  virtual ~LogSink() {}
  virtual void OnLogMessage(const std::string& msg,
                            LoggingSeverity severity,
                            const char* tag);
  virtual void OnLogMessage(const std::string& message,
                            LoggingSeverity severity);
  virtual void OnLogMessage(const std::string& message) = 0;

 private:
  friend class ::rtc::LogMessage;
#if RTC_LOG_ENABLED()
  // Members for LogMessage class to keep linked list of the registered sinks.
  LogSink* next_ = nullptr;
  LoggingSeverity min_severity_;
#endif
};
```
LogSink以链表形式，表明一个LogMessage可以写入到多个LogSink中。

需要关注的是，一个全局的LogSink，以及真正做日志字符串拼接的StringBuilder。

在调用完Log函数后，LogMessage会析构，真正的输出结束实在LogMessage的析构函数中，会遍历
```cpp
LogMessage::~LogMessage() {
  FinishPrintStream();

  const std::string str = print_stream_.Release();

  if (severity_ >= g_dbg_sev) {
#if defined(WEBRTC_ANDROID)
    OutputToDebug(str, severity_, tag_);
#else
    OutputToDebug(str, severity_);
#endif
  }

  webrtc::MutexLock lock(&g_log_mutex_);
  for (LogSink* entry = streams_; entry != nullptr; entry = entry->next_) {
    if (severity_ >= entry->min_severity_) {
#if defined(WEBRTC_ANDROID)
      entry->OnLogMessage(str, severity_, tag_);
#else
      entry->OnLogMessage(str, severity_);
#endif
    }
  }
}
```

# 5. 总结
这里介绍webrtc的log设计，不是因为他多么优秀，主要还是因为他设计得比较优雅，值得学习。特别是这里LogStreamer的链式调用，可变参数模板、可变参数函数处理比较巧妙，这些都是值得赞叹的。