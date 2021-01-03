---
layout: post
title: WebRTC拥塞控制-BBR
---
WebRTC里面主要用到两个拥塞控制算法，即BBR和GCC。今天先看下BBR拥塞控制。

Bottleneck Bandwidth and RTT (hence the name)

BBR作为一个成熟的算法，目前已经应用到TCP协议当中，目前已经集成到linux内核。它解决了CUBIC和Reno这些基于丢包到用塞控制面临的问题。

BBR isn’t “delay-based” per se’
 it probes for RTT and bandwidth in separate phases, and deals with the “gain of the paced rate” rather than the rate itself
