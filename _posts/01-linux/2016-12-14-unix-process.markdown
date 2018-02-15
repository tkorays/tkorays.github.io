---
layout: post
title: Linux - Unix 进程控制
--- 
## 1.进程标识
每一个进程都有一个非负的唯一进程ID。

* ID 0是调度进程，常常被称作交换进程（swapper），该进程不属于磁盘上任何程序，它是内核的一部分，也被成为系统进程。
* ID 1通常是init进程，在自举过程结束时由内核调用。init进程绝不会终止，他是一个普通的用户进程（非内核中的系统进程），但是它以超级用户特权运行。
* ID 2是页精灵进程（pagedaemon）。此进程负责支持虚拟系统的请页操作，它也是内核进程。

<pre><code class="language-c">#include < sys/types.h >
#include < unistd.h >
pid_t getpid(void); /* 返回进程ID */
pid_t getppid(void); /* 返回父进程ID */
uid_t getuid(void); /* 返回调用进程的实际用户ID */
uid_t geteuid(void); /* 返回调用进程的有效用户ID */
gid_t getgid(void); /* 返回进程的实际组ID */
gid_t getegid(void); /* 返回调用进程的有效组ID */
</code></pre>


## 2. fork
<pre><code class="language-c">#include < sys/types.h >
#include < unistd.h >

pid_t fork(void);
</code></pre>

fork被调用一次，但返回两次。子进程返回一次，父进程返回一次。子进程的返回值为0，父进程的返回值为子进程的进程ID。

fork后，子进程获得父进程的数据空间、堆栈的复制品。父子进程并不共享存储空间！！

写时复制（Copy-On-Write，COW）。

* 父进程设置的锁，子进程不能继承。
* 子进程的未决信号集设置为空集。


## 3. vfork
调用序列和返回值与fork相同，但是两者语义不同。

vfork用于创建一个新进程，而该新进程的目的是exec一个新程序。但它不将父进程的地址空间完全复制到子进程中，因为子进程会立即调用exec或exit。`不过在调用exec或eixt前，它在父进程空间中运行！`

vfork保证子程序先运行，在它调用exec或exit之后父进程才可能被调度运行。（如果在这两个函数之前子进程依赖父进程的进一步动作，则会导致死锁。）

## 4. exit
进程有三种正常终止法和两种异常终止法。

正常终止：

* main函数中执行return，等效于调用exit
* 调用exit，此函数由ANSI C定义。其操作包括调用各终止处理程序，然后关闭所有标准I/O流。
* 调用_exit系统调用函数。_exit是由POSIX.1说明的。

异常终止：

* 调用abort。它产生SIGABRT信号。
* 进程接收到某个信号。


## 5. wait和waitpid
当一个进程正常或异常终止时，内核就像其父进程发送SIGCHLD信号。

<pre><code class="language-c">#include < sys/types.h >
#include < sys/wait.h >
pid_t wait(int* statloc);
pid_t waitpid(pid_t pid, int* staloc, int options);
</code></pre>

* 在一个子进程终止前，wait使其调用者阻塞，而waitpid有一个选择项，可使其调用者不阻塞。
* waitpid并不等待第一个终止的子进程，可以控制它锁等待的进程。而wait使其调用者阻塞知道一个子进程终止。

statloc是一个整型指针。如果非空，则返回终止进程的终止状态。如果不关心终止状态，则置为空。

检查wait和waitpid所返回的终止状态的宏：
* WIFEXITED(status)
* WIFSIGNALED(status)
* WIFSTOPPED(status)

waitpid:

* pid=-1，等待任一子进程，与waitpid等效。
* pid>0，等待pid子进程
* pid==0，等待其组ID等于进程组ID的任一子进程
* pid<-1，等待组ID等于pid绝对值的任一子进程。

options：

* WNOHANG，若有pid指定的子进程并不立即可用，则waitpid不阻塞，此时返回0.
* WUNTRACED

waitpid相比wait来说，提供了三个功能：
* 等待一个特定进程
* 提供了一个wait非阻塞版本
* waitpid支持作业控制


## 6. wait3和wait4
4.3+BSD提供了两个附加函数wait3和wait4。
<pre><code class="language-c">#include < sys/types.h >
#incldue < sys/wait.h >
#include < sys/time.h >
#include < sys/resource.h >
pid_t wait3(int* statloc, int options, struct rusage* rusage);
pid_t wait4(pid_t pid, int* statloc, int options, struct rusage* rusage);
</code></pre>

rusage参数要求内核返回由终止进程以及其所有子进程使用的资源摘要。

## 7. exec函数
<pre><code class="language-c">#include < unistd.h >

int execl(const char* pathname, const char* arg0, .../* (char*)0 */);
int execv(const char* pathname, char* const argv[]);
int execle(const char* pathname, const char* arg0, .../* (char*)0, char* const envp[] */)
int execv(const char* pathname, char* const argv[], char* const argv[]);
int execlp(const char* filename, const char* arg0, .../* (char*)0 */
int execvp(const char* filename, char* const argv[]);
</code></pre>

* l: list
* v: vector
* e: env，不使用当前环境变量。
* p: 取filename作为参数，并在path环境变量中寻找可执行文件。

p：任意一个使用路劲前缀中找到一个可执行文件，而文件并不是由连接编辑程序产生的机器可执行代码文件，则认为是一个shell脚本，于是试着调用/bin/sh执行。

调用exec后，进程ID没有改变。拥有原来进程的文件锁、信号、资源等。