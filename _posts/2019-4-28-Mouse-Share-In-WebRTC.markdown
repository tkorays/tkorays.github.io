---
layout: post
title: WebRTC里面的鼠标共享
---
在会议中，有一个常用且非常的功能是桌面共享。将我们的我们的屏幕内容发送到其他与会人，让其他人能够看到我们的桌面演示。而桌面共享伴随的一个重要功能是鼠标共享，将屏幕内容和鼠标一起发送到接收端，这样别人才能够清楚地理解我们的操作。

今天我们将去剖析WebRTC中鼠标共享的代码，揭开鼠标共享的神秘面纱。

## 0 屏幕采集和鼠标采集
鼠标共享代码位于`module/desktop_capture/`里面，名字含有`mouse`和`cursor`的都是鼠标相关的代码。

桌面采集的抽象接口类为`DesktopCapturer`，定义了采集类应该实现的接口。这里要谈到的是其子类`DesktopAndCursorComposer`是一个用来采集屏幕和鼠标并叠加的组合类（DesktopCapturer和MouseCursorMonitor的组合），继承了：
* DesktopCapturer：采集接口
* DesktopCapturer::Callback ： 屏幕内容采集回调
* MouseCursorMonitor::Callback ： 鼠标采集回调
这三个接口，主要用来采集鼠标和屏幕，并在回调中处理结果，完成叠加。

代码中通过`DesktopAndCursorComposer::CaptureFrame`同时采集鼠标和屏幕内容，鼠标采集和屏幕采集完成会触发回调：
* `DesktopAndCursorComposer::OnMouseCursor`
* `DesktopAndCursorComposer::OnMouseCursorPosition`
* `DesktopAndCursorComposer::OnCaptureResult`

返回包含鼠标和屏幕内容的`DesktopFrameWithCursor`对象，DesktopFrameWithCursor的构造完成了鼠标和屏幕内容的叠加。

## 1 采集初始化
鼠标共享主要使用接口：`class MouseCursorMonitor，不同平台上有不通过的子类实现：
* windows平台`MouseCursorMonitorWin`
* mac平台`MouseCursorMonitorMac`
* x11平台使用`MouseCursorMonitorX11`

`MouseCursorMonitor`支持指定窗口或者指定显示器方式的鼠标采集。

使用前调用Init初始化MouseCursorMonitor:

```
virtual void Init(Callback* callback, Mode mode) = 0;
```

其中callback表示采集的回调（DesktopAndCursorComposer中有实现），采集(调用Capture)过程中如果发现形状和位置改变将会触发：`Callback::OnMouseCursor`或`Callback::OnMouseCursorPosition`。Mode表示鼠标的两种采集模式：
* SHAPE_ONLY，即只采集形状
* SHAPE_AND_POSITION，采集形状和位置

创建完成后就可以调用Capture进行鼠标采集：
```
virtual void Capture() = 0;
```

DesktopAndCursorComposer实现了MouseCursorMonitor::Callback和DesktopCapturer::Callback接口，将鼠标和画面混合一起发送。

## 2 鼠标位图表示
鼠标采集形状数据采用`MouseCursor`表示：
```
class MouseCursor {
...
    std::unique_ptr<DesktopFrame> image_;
    DesktopVector hotspot_;
};
```
主要保存了鼠标位图和热点，位图是32bit格式，有使用alpha通道做半透明，但是`不支持反色`。

## 3 windows平台实现
windows平台的实现MouseCursorMonitorWin构造函数可以指定窗口句柄，说明采集可以指定窗口范围，或者指定屏幕id，即可以采集某个屏幕的。

重点在于采集实现Capture，这里没啥好说的，细节的可以看源码：
* 调用GetCursorInfo获取鼠标信息
* 判断鼠标形状是否改变
* 鼠标被有意隐藏（CURSOR_SUPPRESSED）则发空图片（OnMouseCursor）
* 默认发送（OnMouseCursor）的鼠标形状为箭头
* 如果模式为发送鼠标形状和位置，则还要继续获取位置发送（OnMouseCursorPosition）
* 如果是窗口模式，则发送鼠标相对窗口左上角的位置
* 如果是全屏模式，则发送鼠标相对屏幕左上角位置

windows采集里面有个重要的部分是从HCURSOR中获取鼠标图片信息，主要是通过调用GetIconInfo、GetObject、GetDIBits获取鼠标位图数据。鼠标的ICON数据主要有几种类型：
* 黑白，只有mask字段（iinfo.hbmColor == NULL），上半部分为AND mask，下半部分为XOR mask。通过这两个mask可以实现黑、白、透明、反色的效果（请自行推导）。pixel &= andMask; pixel ^= xorMask;
* 彩色，mask表示andMask，color表示xorMask。处理过程中需要注意alpha通道。如果alpha通道不为0， 则表示使用了alpha通道，此时andMask是空的。

WebRTC鼠标采集的结果是一副RGBA图片，因此需要把鼠标数据写到RGBA数据中。如果是彩色格式鼠标(color!=NULL)，则直接复制color数据；如果是黑白鼠标，则把XOR mask当作color字段，复制过去。复制后再处理AND mask，对于彩色鼠标如果有alpha通道则使用alpha通道，否则使用AND mask，这个阶段主要做最终颜色决策，以及给鼠标描边，保证再黑色或者被色背景下可见。

WebRTC实现的一个缺陷是不支持鼠标反色，虽然有给鼠标描边，但是这种做法效果并不好。

## 4 Mac平台实现
mac平台实现中规中矩，获取位置：
```
CGEventRef event = CGEventCreate(NULL);
CGPoint gc_position = CGEventGetLocation(event);
CFRelease(event);
```

获取鼠标图片位图数据：
```
NSCursor* nscursor = [NSCursor currentSystemCursor];
NSImage* nsimage = [nscursor image];
NSPoint nshotspot = [nscursor hotSpot];
CGImageRef cg_image =
      [nsimage CGImageForProposedRect:NULL context:nil hints:nil];
CGDataProviderRef provider = CGImageGetDataProvider(cg_image);
CFDataRef image_data_ref = CGDataProviderCopyData(provider);
const uint8_t* src_data =
      reinterpret_cast<const uint8_t*>(CFDataGetBytePtr(image_data_ref));
int src_stride = CGImageGetBytesPerRow(cg_image);
```

## 5 总结
WebRTC里面的鼠标采集还是太简单了，笔者自己之前的实现比WebRTC的功能更强大，细节更完善。但是WebRTC的实现也给了我很多启发，不得不说他们的代码写的很赞，鼠标采集、屏幕采集等抽象得很简单。
