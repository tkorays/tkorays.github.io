---
layout: post
title: 线性预测编码LPC
---

在语音信号处理中，线性预测是一种重要的短时分析技术，可以用过去的一段语音来估计之后样本点的模型参数，即可以利用过去的样本点预测未来的样本点。LPC根据是否对过去样本点加窗处理，又有`自相关法`和`自协方差法`。自相关法需要对过去一段语音进行加窗处理，与自协方差相比，它有着高效的递推算法，因此使用比较广泛。本文将介绍如何利用递推算法求解LPC中的模型参数。

## 1. 基本原理
顾名思义，线性预测分析，就是通过用过去样本点的线性组合来预测将来样本值：

$$
    s'(n)=\sum_1^p a_i*s(n-i)
$$

预测误差为：

$$
    \varepsilon=s(n)-s'(n)=s(n)-\sum_1^p a_i*s(n-i)
$$

LPC的基本思想在于，通过将误差最小化，得到合适的参数 $$a_i$$ 。过程推导如下：

$$
\sigma_\varepsilon^2=\sum_n\varepsilon^2(n)
$$

将该公式展开：

$$
\sigma_\varepsilon^2=\sum_n[s(n)-\sum_1^p a_i s(n-i)]^2\\
={\sum_n s^2(n)}-2\sum_{k=1}^p a_k{\sum_n s(n-k)s(n)}+\sum_{k=1}^p\sum_{i=1}^p a_k a_i{\sum_n s(n-k)s(n-i)}
$$

再对 $$a_k$$ 求偏导：

$$
\frac{\partial\sigma_\varepsilon^2}{\partial a_k}=0,k=1,2...p
$$

$$
2\sum_n{s(n-k)s(n)}-2\sum_{i=1}^p a'_i{\sum_n{s(n-k)s(n-i)}}=0,k,i=1,2...p
$$

我们假设 $$\phi(k,i)=\sum_n s(n-k)s(n-i)$$，则有：

$$
\sum_{i=1}^p a'_i \phi(k,i) = \phi(k,0),k=1,2...p
$$

这个方程称为`LPC正则方程`。

## 2. 线性预测方程组求解
