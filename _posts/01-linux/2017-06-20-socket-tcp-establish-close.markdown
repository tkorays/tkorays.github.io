---
layout: post
title: socket-tcp连接的建立与终止
---

服务器必需准备好接收客户端连接，通常需要调用socket、bind、listen这三个函数完成`被动打开`。
而客户端通过调用connect发起`主动打开`，客户端端连接，将经历三次握手的过程。

