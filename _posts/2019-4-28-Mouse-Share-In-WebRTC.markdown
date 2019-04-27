---
layout: post
title: WebRTC里面的鼠标共享
---
今天将要剖析WebRTC鼠标共享部分代码，探索下WebRTC的鼠标共享。

## 1 采集初始化
鼠标共享主要使用接口：`class MouseCursorMonitor，不同平台上有不通过的子类实现：
* windows平台MouseCursorMonitorWin
* mac平台MouseCursorMonitorMac
* x11平台使用MouseCursorMonitorX11

MouseCursorMonitor支持指定窗口或者指定显示器方式的鼠标采集。

使用前调用Init初始化MouseCursorMonitor:

```
virtual void Init(Callback* callback, Mode mode) = 0;
```

其中callback表示采集的回调，采集(调用Capture)过程中如果发现形状和位置改变将会触发：`Callback::OnMouseCursor`或`Callback::OnMouseCursorPosition`。Mode表示鼠标的两种采集模式：
* SHAPE_ONLY，即只采集形状
* SHAPE_AND_POSITION，采集形状和位置

创建完成后就可以调用Capture进行鼠标采集：
```
virtual void Capture() = 0;
```

DesktopAndCursorComposer实现了MouseCursorMonitor::Callback和DesktopCapturer::Callback接口，`将鼠标和画面混合一起发送`。

## 2 windows平台实现
windows平台的实现MouseCursorMonitorWin构造函数可以指定窗口句柄，说明采集可以指定窗口范围，或者指定屏幕id，即可以采集某个屏幕的。

重点在于采集实现Capture，这里没啥好说的：
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

WebRTC还提供了一个功能，就是给鼠标加白边，保证鼠标在黑色背景下看的清楚。这应该是WebRTC没有处理好RGB鼠标的反色，实际上彩色鼠标如果使用了alpha通道，那就可以使用alpha通道来做反色。

## 3 Mac平台实现
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

## 4 总结
WebRTC里面的鼠标采集还是太简单了，笔者自己之前的实现比WebRTC的功能更强大，细节更完善，这里只吹吹，怎么实现的这是个秘密，哈哈。但是WebRTC的实现也给了我很多启发，不得不说他们的代码写的很赞，鼠标采集、屏幕采集等抽象得很简单。
