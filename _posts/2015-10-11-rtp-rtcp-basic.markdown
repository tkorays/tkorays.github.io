---
layout: post
title: RTP & RTCP 基础
date: 2015-10-11 10:12:04
description: RTP（Real-time Transport Protocol）和RTCP(Real-time Transport Control Protocol)是在RFC3550中定义的一对网络传输协议协议，两者相互配合完成数据传输。
categories:
- blog
---

RTP，Real-time Transport Protocol，即实时传输协议。它由IETF多媒体传输工组小组在1996年在RFC1889中发布，最新的版本为RFC3550.RTP提供了端到端网络传输功能，适用于单播或多播网络中传输音频、
视频等实时数据。

RTCP，Real-time Transport Protocol，它和RTP配合使用，完成实时数据的传输。
看名字就知道，它是起控制作用的。RTCP主要完成对数据传输的监控，提供最一个最小的控制和识别。
RTCP在设计上能适应大的广播网络，这依赖于对网关根据RTCP报告估计发送端／接受端规模，
动态调整发送间隔。

## 实时性
这里需要强调的是`实时性`，RTP从设计上就需要考虑到这个因素。
像TCP这样的协议有重传机制，而这对于实时性要求高的应用是没有太大用处的。
而UDP也不能直接使用，它没有QoS（Quality of Service）保证，难以同步媒体流。
所以，TCP和UDP都不宜直接用来负载实时数据。

因此出现了RTP和RTCP这两个协议，他们组合起来能保证数据的实时传输。

## 协议结构
RTP&RTCP在设计上是独立于下层传输层、网络层协议的，因此传输层使用TCP或UDP，网络层使用
IP或ATM都是可以的。通常使用的UDP协议来承载RTP&RTCP协议，RTP和RTCP使用不同端口，
RTP使用偶数端口，RTCP的端口为RTP端口＋1.

因此，通常的RTP&RTCP协议结构如图：
```
｜－－－－－－－－－－－－｜
｜        App          ｜
｜－－－－－－－－－－－－｜
｜    RTP & RTCP       ｜
｜－－－－－－－－－－－－｜
｜     UDP / TCP       ｜
｜－－－－－－－－－－－－｜
｜     IP / ATM        ｜
｜－－－－－－－－－－－－｜
｜        MAC          ｜
｜－－－－－－－－－－－－｜
```

这里需要注意的是，可以将RTP&RTCP看作是传输层的一部分，也可以看做是应用层的一部分，
这取决你自己站在那个层次来看待。如，对于RTP&RTCP开发者来说，可能会把它归于应用层；而
应用对开放者会将RTP&RTCP&UDP都看作是传输层。
