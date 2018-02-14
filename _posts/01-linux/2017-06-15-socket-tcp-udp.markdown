---
layout: post
title: socket-TCP/UDP套接字
---

## 1. socket
在使用socket之前，先需要调用socket函数创建一个socket描述符。
<pre><code class="language-c">#include <sys/socket.h>
int socket(int family, int type, int protocol);
</code></pre>

`family`表示协议族：

|family|说明|
|-|-|
|AF_INET|IPv4协议|
|AF_INET6|IPv6协议|
|AF_LOCAL|AF_UNIX, unix域协议|
|AF_ROUTE|路由套接字|
|AF_KEY|密钥套接字|

AF_前缀表示地址族，PF_前缀表示协议族，历史上曾想单个协议族可以支持多个地址族，但最终以失败告终。一半而言，AF_和PF_值相等。

`type`表示套接字类型：

|tpey|说明|
|-|-|
|SOCK_STREAM|字节流套接字|
|SOCK_DGRAM|数据包套接字|
|SOCK_SEQPACKET|有序分组套接字|
|SOCK_RAW|原始套接字|

`protocol`表示套接字使用的协议：

|protocol|说明|
|-|-|
|IPPROTO_TCP|tcp传输协议|
|IPPROTO_UDP|udp传输协议|
|IPPROTO_SCTP|sctp传输协议|

protocol一般可以填0，表示使用family和type组合所选择的协议。比如`AF_INET+SOCK_STREAM = IPPROTO_TCP／IPPROTO_SCTP`， `AF_INET+SOCK_DGRAM = IPPROTO_UDP`, `AF_INET+SEQPACKET = IPPROTO_SCTP`, `AF_INET+RAW=IPv4`等。但是并不是所有的组合都是有效的！

## 2. connect
connect用于客户端与服务器建立连接：
<pre><code class="language-c">#include <sys/socket.h>
int connect(int sockfd, struct sockaddr* servaddr, socklen_t addrlen);
</code></pre>
sockfd是套接字描述符，servaddr用来描述服务器地址，包含服务器的ip和端口号。调用connect后，会进行tcp三次握手。

## 3. bind
给本地协议地址赋予一个套接字，套接字将使用这个套接字地址进行通信。
<pre><code class="language-c">#include <sys/socket.h>
int bind(int sockfd, const struct sockaddr* myaddr, socklen_t addrlen);
</code></pre>
如果一个客户端或服务器未绑定相应的端口，当调用connect或listen的时候，系统将自动为其分配一个临时端口。

## 4. listen
listen为服务器端调用，将一个未连接的套接字转化为被动套接字，指示内核应接收指向该连接的请求。
<pre><code class="language-c">#include <sys/socket.h>
int listen(int sockfd, int backlog);
</code></pre>
backlog指定了最大连接数目。

## 5. accpect
服务器端调用accept，从已完成连接队列中返回下一个已完成连接。如果连接为空，则进入休眠。
<pre><code class="language-c">#include <sys/socket.h>
int accept(int sockfd, const struct sockaddr* cliaddr, socklen_t addrlen);
</code></pre>
accept成功，将返回一个新的socket描述符，该描述符不同于服务器本身用于监听的socket描述符。内核会为每一个客户端创建一个socket描述符，在处理完成后关闭。

## 6. send
发送数据：
<pre><code class="language-c">#include <sys/socket.h>
int send(int sockfd, const void *msg, int len, int flags);
</code></pre>

## 7. recv
接收数据：
<pre><code class="language-c">#include <sys/socket.h>
int recv(int sockfd, void *buf, int len, unsigned int flags);
</code></pre>

`send`和`recv`都有一个参数flags，一般来说可以默认填0，但是有些场景需要根据需要填写：

* MSG_DONTROUTE，目的主机在某个直连的本地网络上，不经过路由表查找，send
* MSG_DONTWAIT，仅本操作非阻塞，recv、send（不是所有系统都支持）
* MSG_OOB，发送或接收带外数据，recv、send
* MSG_PEEK，窥探外来数据，可以用于recv、recvfrom查看已可读取的数据，读取完成后不丢弃数据，recv
* MSG_WAITALL，告诉内核不要在未读完指定的字节前返回，如果支持该标志则功能与readn相同，recv

## 8. recvfrom
recvfrom是用于UDP中接收报文。
`recvfrom`用于从socket接收数据，`from`这个出参表明了是谁发送了数据报（UDP）或者是谁发起了连接（TCP）。
<pre><code class="language-c">#include <sys/socket.h>
ssize_t recvfrom(int sockfd, void* buff, size_t mbytes, int flags, struct sockaddr* from, socklen_t* addrlen);
</code></pre>
返回值表示接收到数据数量。


## 9. sendto
sento是用于UDP中发送报文。
同理，`sendto`发送数据到指定地址，`to`这个地址入参表示数据报将发送何处（UDP）或者与之建立连接到协议地址（TCP）。
<pre><code class="language-c">#include <sys/socket.h>
ssize_t recvfrom(int sockfd, void* buff, size_t mbytes, int flags, const struct sockaddr* to, socklen_t* addrlen);
</code></pre>
返回值表示发送的数据数量。

## 10. close
用于关闭套接字。执行完关闭后，套接字将不再允许任何读写操作。
<pre><code class="language-c">#include <sys/socket.h>
int close(int sockfd);
</code></pre>

## 11. shutdown
shutdown支持更高级的关闭操作。how为0表示不允许数据接收；how为1表示不允许数据发送，how为2表示不允许收发，同close。利用shutdown，可以实现tcp连接半关闭。
<pre><code class="language-c">#include <sys/socket.h>
int shutdown(int sockfd, int how);
</code></pre>

## 12. getsockname/getpeername
<pre><code class="language-c">#include <sys/socket.h>
int getsockname(int sockfd, const struct sockaddr* localaddr, socklen_t addrlen);
int getpeername(int sockfd, const struct sockaddr* localaddr, socklen_t addrlen);
</code></pre>
* getsockname，获取与sockfd相关的本地协议地址
* getpeername，获取与sockfd相关的对端协议地址

