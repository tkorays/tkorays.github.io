---
layout: post
title: socket-套接字选项
---

## 1. getsockopt和getsockopt
<pre><code class="language-c">#include <sys/socket.h>
int getsockopt(int sockfd, int level, int optname, void* optval, socklen_t optlen);
int setsockopt(int sockfd, int level, int optname, const void* optval, socklen_t optlen);
</code></pre>
* sockfd，打开的流套接字。
* level，解释选项的代码，或为通用套接字代码，或为某个特定于协议的代码。如SOL_SOCKET、IPPROTO_IP、IPROTO_TCP、IPPROTO_ICMPV6、IPPROTO_IPV6、IPPROTO_SCTP等。
* optname，选项名，SO_XXX、IP_XXX、ICMPV6_XXX、IPV6_XXX、MCAST_XXX、TCP_XXX、SCTP_XXX。
* optval，指向选项的指针。
* optlen，得到的选项大小。

## 2. fcntl
fcntl可以用于各种描述符的操作:
<pre><code class="language-c">#include < fcntl.h>
int fcntl(int fd, int cmd, ... /* int arg */);</code></pre>

* 设置套接字为非阻塞式I/O型，F_SETFL，O_NONBLOCK 
* 设置套接字为信号驱动式I/O型，F_SETFL，O_ASYNC
* 设置套接字属主，F_SETOWN
* 获取套接字属主，F_GETOWN

<pre><code class="language-c">int flags;
flags = fcntl(fd, F_GETFL, 0);
flags |= O_NONBLOCK;
fcntl(fd, F_SETFL, flags);</code></pre>