---
layout: post
title: socket-网络套接字地址
---

在使用socket过程中，我们需要使用一个结构去表示一个套接字的地址。我们使用的套接字有Pv4、IPv6、Unix等这几种，因此也需要用不同的套接字结构去表示。所有的套接字地址都以`sockaddr_`开头，结尾表示套接字的类型，`sockaddr_in`、`sockaddr_in6`。

## 1. IPv4的套接字地址
IPv4的套接字在`netinet/in.h`文件中被定义。IPv4套接字结构又被称为网络套接字结构，因此IPv4的套接字结构以in结尾：
<pre>
<code class="language-c">typedef	uint32_t  in_addr_t;    /* base type for internet address */
typedef uint8_t   sa_family_t;
typedef	uint16_t  in_port_t;
typedef uint32_t  socklen_t;

/*
 * Internet address (a structure for historical reasons)
 */
struct in_addr {
	in_addr_t s_addr;
};

/*
 * Socket address, internet style.
 */
struct sockaddr_in {
	uint8_t	        sin_len;
	sa_family_t     sin_family;  /* AF_INET */
	in_port_t       sin_port;
	struct	in_addr sin_addr;
	char		    sin_zero[8];
};</code>
</pre>
sin_len这个字段是为了支持OSI添加的，不是所有实现都支持该字段。比如有些平台将sim_family定义为uint16_t，没有长度字段。sin_zeros字段暂时未使用，需要置零。

在作为参数传递时，通常需要支持所有的协议族，因此，需要一个通用的结构来支持所有协议的参数传递：
<pre><code class="language-c">/*
 * Structure used by kernel to store most addresses.
 */
struct sockaddr {
	uint8_t	    sa_len;      /* total length */
	sa_family_t	sa_family;   /* address family */
	char        sa_data[14]; /* addr value (actually larger) */
};</code></pre>
在传递参数时使用： 
<pre><code class="language-c">int bind(int, struct sockaddr*, socklen_t);
</code></pre>

## 2. IPv6的套接字地址
IPv6的套接字在`netinet/in.h`文件中被定义，以in6结尾:
<pre><code class="language-c">struct in6_addr {
    uint8_t   s6_addr[16];
};
struct sockaddr_in6 {
	uint8_t         sin6_len;        /* length of this struct(28) */
	sa_family_t	    sin6_family;	 /* AF_INET6 */
	in_port_t       sin6_port;	     /* Transport layer port # (in_port_t) */
	uint32_t        sin6_flowinfo;	 /* IP6 flow information */
	struct in6_addr	sin6_addr;	     /* IP6 address */
	uint32_t        sin6_scope_id;	 /* scope zone index */
};</code></pre>

新的sockaddr_storage克服了sockaddr的缺点，足以容纳所有套接字结构:
<pre><code class="language-c">struct sockaddr_storage {
	uint8_t	ss_len;         /* address length */
	sa_family_t	ss_family;	/* address family: AF_XXX value */
	/* 内存空间根据需要申请 */
};</code></pre>

## 3. 地址转换
在使用过程中，我们经常需要在二进制地址和十进制点分地址间转换，地址转换常用到的函数有：`inet_aton`、`inet_ntoa`、`inet_addr`, 这些函数在`arpa/inet.h`中被定义：
<pre><code class="language-c">char* inet_ntoa(struct in_addr);
int inet_aton(const char *, struct in_addr *); /* 第二个参数为空，可以用于测试地址有效性 */
in_addr_t inet_addr(const char *);/* 被废弃 */</code></pre>
* inet_ntoa用于将网络地址转换为十进制点分地址字符串。
* inet_aton将十进制点分地址转换为网络地址，成功返回0。
* inet_addr将十进制点分地址转换为网络地址，直接返回，失败则为INVALID_NONE。

`inet_ntop`和`inet_pton`是IPv4和IPv6通用的函数，n和p分别表示numeric、presentation：
<pre><code class="language-c">const char* inet_ntop(int family, const void * addrptr, char *strptr, socklen_t len);
int inet_pton(int family, const char * strptr, void *addrptr);</code></pre>
* inet_ntop将地址从数值格式(addtptr)转换为表示格式(strptr).
* inet_pton相反.
