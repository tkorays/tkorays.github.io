---
layout: post
title: C&C+ Calling Convention
---
调用约定(Calling Convention) 是计算机编程中一个比较底层的设计，它主要涉及：

* 函数参数通过寄存器传递还是栈？
* 函数参数从左到右还是从右到左压栈？
* 是否支持可变参数函数（vararg function or variadic function）。
* 是否需要函数原型？
* 怎么修饰函数名，唯一标识函数？
* 调用者(caller)还是被调用者(called or callee)清理堆栈？


## 1. Calling Conventions
在C和C++中有几种调用约定：`__cdecl`, `__stdcall`, `__fastcall`, `__thiscall`, `__clrcall`, `__vectorcall`。下面首先介绍几种调用约定。

### 1.1 __cdecl

C Declaration Calling Convention，C声明调用约定。它是C和C++默认的调用约定。特点：

* 堆栈由调用者清除（手动清除）。
* 参数从右到左压栈。
* 支持可变参数（函数自己并不知道自己有多少个参数，因此需要调用者来清除）。
* 编译后函数名改编为：“_函数名”。如_funcname。

### 1.2 __stdcall

Standard Calling Convention，标准调用约定。又称为Pascal Convention。特点：

* 被调用函数自动将参数弹出栈。
* 参数从右到坐压栈（和__cdecl一样），如果调用类的成员函数，最后压入this指针。
* 需要一个函数原型，不支持变参函数。
* 函数名改编：“_函数名@参数字节大小十进制”。如_funcname@8。

### 1.3 __fastcall

Fast Calling Convention，快速调用约定。通过使用寄存器解决效率问题。特点：

* 函数参数部分通过寄存器传递，函数中最左的两个DWORD（寄存器大小是双字）或者更小的参数，通过寄存器传递。剩下的从右到左堆栈传递。
* 函数名改编：“@函数名@函数参数字节大小十进制”。
* 返回方式同__stdcall。

### 1.4 __thiscall

主要用于解决类中this指针传递的问题，使用寄存器来传递this指针。参数从右往左压栈，返回方式同__stdcall.

### 1.5 __clrcall

__clrcall是C++ .Net里面的。

### 1.6 __vectorcall

要求尽可能在寄存器中传递参数。函数名改编为”@@函数名@参数字节数十进制”。这是微软自己添加的标准。
总结

除了`__cdecl`（以及`__clrcall`），其他的都是被调用者清除堆栈。

## 2. 函数名修饰

### 2.1 C++中函数名修饰
在C语言中不存在重载，因此不需要担心同名函数问题，但是在C++中，使用C中的函数名修饰方式就存在问题。对于重载的函数，仅仅凭函数名和参数内存大小无法完全区分；类的成员函数表示并没有说明。所以在C++中，对于函数名改编需要一套策略。函数名格式大致如`?FuncName@@YGXZ`这种形式。

* 修饰名以`?`开始，后面接函数名。
* 函数名后为`@@YG`、`@@YA`、`@@YI`，分别代表stdcall、cdecl、fastcall。
* @@YG等后面接着参数类型字符，第一个表示返回值类型。
* 字符串以`@Z`结束，如果函数没有参数，则直接以`Z`结束。

参数符号如下：

* X： void 
* D： char
* E： unsigned char
* F： short
* G:  unsigned short
* H： int
* I： unsigned int
* J： long
* K： unsigned long
* M： float
* N： double
* _N： bool
* PA: 指针
* PB: const指针
* U: struct

所以`int __stdcall fa();`可以改编为：`?fa@@YGHXZ`；`char* fb(int,bool);`改编为`?fb@@YAPADH_N@Z`。

所以在C++中函数名改编和C不同，如果需要遵循C中的改编方式，可以使用`extern "C"{}`。

### 2.2 C++成员函数名修饰
类的成员函数的调用方式为thiscall，其函数名修饰方式和普通函数有些差别。成员函数名改编需在函数名和参数中间插入类名。且需要指定函数一些性质，如

* public为@@QAE，protected为@@IAE，private为@@AAE
* 如果函数声明为const，则public为@QBE，protected为@@IBE，private为@@ABE。
* 如果参数类型是类实例的引用，则使用“AAV1”，const引用则为`ABV1`。

如：

* `?FuncA@ClassA@@QAEXH@Z`表示`void ClassA::FuncA(int);`。
* `?FuncB@ClassA@@QAEXABV1@Z`表示`void ClassA::FuncB(const ClassA&);`



