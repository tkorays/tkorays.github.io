---
layout: post
title: Goertzel Algorithm(DTMF Detection)
---

本文将介绍DTMF检测算法Goertzel。

## 1. 原理
对于序列 $$x[n],n\in[0...N-1]$$ ，其DFT为：

$$
X[K]=\sum_{l=0}^{N-1}{x[l]e^{-j2\pi{kn}/N}}=\sum_{l=0}^{N-1}{x[l]W_N^{kn}}
，其中，W_N=e^{-jw\pi/N}
$$


因为$$W_N^{-KN}=e^{-j2\pi(-kN)/N}=1$$，对DFT乘上该式有：

$$
X[k]=W_N^{-kN}\sum_{l=0}^{N-1}x[l]W_N^{kn}=\sum_{l=0}^{N-1}x[l]W_N^{-k(N-l)}
$$

上式可以看作是序列x[n]和序列h[n]的卷积和，即x[n]经过系统h[n]后的响应：

$$
y_k[n]=x_k[n]*h_k[n]=\sum_{l=0}^{N-1}x[l]W_N^{-k(N-l)}
$$

其中，

$$h_k[n]=\left\{
\begin{aligned}
e^{-j2\pi{kn}} & & {n\geq 0} \\
0 & & {n<0}
\end{aligned}
\right.
$$

对 $$h_k[n]$$ 做Z变换：

$$
H_k(z)=\sum_{n=-\infty}^{\infty}h_k[n]=\sum_{n=0}^{\infty}e^{-j2\pi{kn}}z^{-n}=\frac{1}{1-W_N^{-k}z^{-1}}
$$

对上下式分别乘上 $$(1-W_N^k{z^{-1}})$$：

$$
H_k(z)=\frac{1-W_N^{k}{z^{-1}}}{1+2z^{-1}cos(2\pi{k/N})+z^{-2}}
$$

上面的式子是一个二阶系统，可以引入一个中间变量 $$q_k[n]$$ ：


$$
H_k(z)=\frac{Y_k(z)}{X_k(z)}=\frac{Y_k(z)/Q_k(z)}{X_k(z)/Q_k(z)}
$$


得到：

$$
\frac{Y_k(z)}{Q_k(z)}=1-W_N^{k}z^{-1}
$$

$$
\frac{X_k(z)}{Q_k(z)}=1-2z^{-1}cos(2\pi{k/N})+z^{-2}
$$

于是:

$$
q_k[n]=x[n]+2cos(2\pi{k/N})q_k[n-1]-q_k[n-2]
$$

$$
y_k[n]=q_k[n]-W_N^{k}q_k[n-1]
$$

上面的第一个式子可以看成是一个IIR滤波器，第二个式子可以看成是一个FIR滤波器。

其系统框图如下：
<img src="/public/post/img/goertzel-system.png" style="width:400px;margin: auto auto;"/>

