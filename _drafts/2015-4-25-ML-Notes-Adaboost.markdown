---
layout: post
title: 统计学习方法-Adaboost
---
*该篇是李航《统计学习方法》读书笔记。*

## 1. 概念
`boosting方法原理`：对于复杂任务，综合多个专家判断得出结论比一个专家单独判断更可靠。即『三个臭皮匠赛过诸葛亮』

`强可学习`，Strong Learnable，对于一个概念，可以用一个多项式算法学习，结果正确率很高，则这个概念是强可需诶的。

`弱可学习`，Weakly Learnable，对于一个概念，可以用一个多项式算法学习，结果正确率仅仅高于随机猜测，则这个概念是弱可学习。

强可学习和弱可学习是等效的。因此弱一个概念存在一个弱学习算法，就可以通过一些方法将它提升（boosting）为强学习算法，因为发现弱学习算法比较容易。如何提升，Adaboost就是一种方法。

如何提升：

* 每一轮如何改变训练数据权值或概率分布？：关注分类错误样本点，以`提升准确率`。
* 如何将弱分类器组合成强分类器？`加权多数表决`。


