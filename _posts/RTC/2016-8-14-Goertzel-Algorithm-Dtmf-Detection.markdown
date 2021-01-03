---
layout: post
title: 音视频 - Goertzel Algorithm(DTMF Detection)
---

本文将介绍DTMF检测算法Goertzel。

## 1. 原理
对于序列 $$x[n],l\in[0...N-1]$$ ，其DFT为：

$$
X[k]=\sum_{l=0}^{N-1}{x[l]e^{-j2\pi{kl}/N}}=\sum_{l=0}^{N-1}{x[l]W_N^{kl}}
，其中，W_N=e^{-jw\pi/N}
$$


因为$$W_N^{-KN}=e^{-j2\pi(-kN)/N}=1$$，对DFT乘上该式有：

$$
X[k]=W_N^{-kN}\sum_{l=0}^{N-1}x[l]W_N^{kn}=\sum_{l=0}^{N-1}x[l]W_N^{-k(N-l)}
$$

上式可以看作是序列x[n]和序列h[n]的卷积和，即x[n]经过系统h[n]后的响应：

$$
y_k[n]=x_k[n]*h_k[n]=\sum_{l=0}^{n}x[l]W_N^{-k(n-l)}
$$

其中，

$$h_k[n]=\left\{
\begin{aligned}
e^{-j2\pi{kn}/N} & & {n\geq 0} \\
0 & & {n<0}
\end{aligned}
\right.
$$
对 $$h_k[n]$$ 做Z变换：
$$
H_k(z)=\sum_{n=-\infty}^{\infty}h_k[n]=\sum_{n=0}^{\infty}e^{-j2\pi{kn/N}}z^{-n}=\frac{1}{1-W_N^{-k}z^{-1}}
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
上面的第一个式子可以看成是一个IIR滤波器，第二个式子可以看成是一个FIR滤波器,IIR的输出作为FIR的输入。

其系统框图如下：
<img src="/public/post/img/goertzel-system.png" style="width:400px;margin: auto auto;"/>

## 2. 利用Goertzel计算DFT
通过比较$$y_k[n]$$和$$X[k]$$我们发现:
$$
X[k]=y_k[n]|_{n=N}
$$
而$$y_k[n]$$可以通过求$$q_k[n]$$得到，$$q_k[n]$$可以通过递推得到，因此可以通过递推计算$$y[N]$$得到DFT，计算出能量谱：
$$
|X[k]|^2=|y_k[N]|^2
$$
由于$$y_k[n]$$要用到$$q_k[n]$$，$$q_k[n]$$需要用到点$$x[N]$$，这个点并不存在。我们假设最后一次计算的$$x[N]＝0$$，则可以得到：
$$
q_k[N]=2cos(2\pi{k/N})q_k[N-1]-q_k[N-2]
$$
结下来我们可以将最后一次计算的$$q_k[N]$$代入$$y_k[n]$$的递推公式，得到最后一个点：
$$
y_k[N]=q_k[N]-W_N^{k}q_k[N-1] \\
=(2cos(2\pi(k/N))q_k[N-1]-q_k[N-2])-W_N^{k}q_k[N-1] \\
=W_N^{-k}q_k[N-1]-q_k[N-2]
$$

Goertzel算法每次计算一个频率点，效率比FFT更高，可以很好地应用于DTMF检测。


## 3. DTMF检测
matlab提供了GOERTZEL函数，可以直接用来检测DTMF：

<pre class="language-matlab">
<code>
Fs = 8000;
N = 205;
lo = sin(2*pi*697*(0:N-1)/Fs);
hi = sin(2*pi*1209*(0:N-1)/Fs);
data = lo + hi;
f = [697 770 852 941 1209 1336 1477];
freq_indices = round(f/Fs*N) + 1;
dft_data = goertzel(data,freq_indices);
stem(f,abs(dft_data))

ax = gca;
ax.XTick = f;
xlabel('Frequency (Hz)')
title('DFT Magnitude')
</code>
</pre>

结果：

<img src="/public/post/img/goertzel-result.png" style="margin:auto auto;"/>
