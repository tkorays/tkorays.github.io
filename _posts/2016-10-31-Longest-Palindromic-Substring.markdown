---
layout: post
title: (Algorithm)Longest Palindromic Substring
---
Longest Palindromic Substring，最长回文字符串。所谓回文，即一个字符串正着读和反着读是一样的。回文相当有趣，古人也喜作回文事，这里附上一首明末浙江才女吴绛雪的《四时山水诗》，是不是很有意思？

```
莺啼岸柳弄春晴，
柳弄春晴夜月明。
明月夜晴春弄柳，
晴春弄柳岸啼莺。
```

而对于回文字符串的搜索，也是一件相当有趣的事情。我们需要从一串字符中找到最长的回文字符串。这里我们一步步地思考，尝试用更多的方法去解决问题。

## 1) 暴力求解(Brute Force)
如果没人看你写的烂代码，也没人关注性能，你也可以偷偷地尝试暴力求解最长回文字符串。暴力求解一般可以这样考虑：

* 在N个字符中选取一个起始字符，选取一个结束字符，这样可以得到$$C_N^2$$个串
* 然后我们需要对这$$C_N^2$$个串进行检查，是否为回文字符串，以找到最长的。每次平均时间复杂度为O(N)
* 因此，暴力求解的时间复杂度为$$O(N^3)$$。

我敢打赌，敢这样写的人心理素质都是相当好的。

## 2) 动态规划(Dynamic Programming)
暴力求解虽然效率低，但是也并不能因为自己想到这种方法而自责，我们可以在暴力求解的基础上做些改进。为了减少对包含回文的字符串重复搜索，这里可以使用动态规划将$$O(N^3)$$改进到$$O(N^2)$$。

对于一个回文字符串$$P_{i+1,j-1} = True$$，如果$$S_i=S_j$$，则有$$P_{i,j} = True$$。我们可以利用这个特点，将问题转化为DP问题。我们开始找到所有长度为1和长度为2度回文字符串，然后再找到长度为3、4......的回文字符串。

这里我们需要创建一个$$O(N^2)$$的表来存储$$P_{i,j} = True / False$$，该算法运行时间为$$O(N^2)$$。

<pre class="language-python">
<code>
def lps_dp(s):
    n = len(s)
    start = 0
    max_len = 1
    table = numpy.array([[False]*1000]*1000)
    for i in range(n):
        table[i][i] = True

    # 长度为1或2的回文字符串
    for i in range(n-1):
        if s[i] == s[i+1]:
            table[i][i+1] = True
            # 获取第一个最长子串
            max_len, start = (2, i) if max_len < 2 else (max_len, start)

    # 对于每个字符串,判断长度从3到n点字符串是否为回文串
    # 注意外层循环为长度
    for length in range(3,n+1):
        # i从0到n-length
        for i in range(n - length + 1):
            # j是i的对称点
            j = i + length - 1
            if s[i] == s[j] and table[i+1][j-1]:
                table[i][j] = True
                # 获取第一个最长子串
                max_len, start = (length, i) if max_len < length \
                    else (max_len, start)
    return s[start:start+max_len]
</code>
</pre>

### 3) 继续优化，基于中点匹配
因为回文串是对称的，因此，我们可以选取一个中间点，从中间点向左右匹配。中间点一共有2N+1种（长度为偶数点回文串中点可能在两个字符串中间，这种处理方法可以避免考虑字符串长度为奇偶问题），向左右匹配最长计算N/2，因此复杂度为$$O(N^2)$$。

<img src="/public/post/img/lps_center.png" style="width:500px;margin: auto auto;"/>

<pre class="language-python">
<code>
def lps_center(s):
    mc1, mc2 = 0, 0
    n = len(s)
    # from 0 to 2n-1
    for i in range(2*n):
        c1, c2 = int(i/2), int(i/2) + (i%2 if i != (2*n-1) else 0)
        while c1 >= 0 and c2 <= n-1:
            if s[c1] != s[c2]:
                break
            mc1, mc2 = (c1, c2) if (c2 - c1) > (mc2 - mc1) else (mc1, mc2)
            c1, c2 = c1-1, c2+1
    return s[mc1:mc2+1]
</code>
</pre>

### 4) 继续优化，推导Manacher算法
基于第三种方法，我们继续考虑，我们基于中点向左右匹配，如果已经匹配一个长串，我们继续右移中点，新的中点我们可能不需要完全从头开始匹配，可以利用对称性，减少计算量。
<img src="/public/post/img/manacher_1.png" style="width:500px;margin: auto auto;"/>
如上图，我们已经得到了aba是回文子串，这里不需要完全从头开始匹配，直接利用对称点信息，节省一些计算，从后面开始匹配。

一般为了简化问题，我们在字符串间添加一些标志，如"#"，于是abcdef就变成#a#b#c#d#e#f#（在实际编码中并不需要真的去添加，这里只是为了更好说明原理）。假设原字符串为S，添加#后字符串为T，对于字符串T，以字符i为中心，回文半径长度（不包括自身）为$$P_i$$：

``
T = # a # b # a # a # b # a #

P = 0 1 0 3 0 1 6 1 0 3 0 1 0
``

我们发现一个有趣的现象，$$P_i$$正好就是以i为中心的回文串长度！

但是这里需要注意一个匹配过头的问题：
<img src="/public/post/img/manacher_2.png" style="width:500px;margin: auto auto;"/>
这里c的对称点回文串范围超过最长回文串范围，并不能以对称点的最长回文串开始计算，而是要考虑边界问题。

对于一个回文串，中心为c，左侧为l，右侧为r，c<i<r，其对称点为i'=2c-i。
* 如果i'对应的回文串在回文串c范围内，则$$P_i >= P_{i'}$$
* 如果i'对应的回文串超出回文串c范围，超出部分可能在i回文串中找不到对应部分，只能匹配到边界部分截止,$$P_i >= r-i$$

综合可以得到$$P_i>=min(P_{2c-i}, r-i)$$。

按照这个思路，我们只需要对整个字符串扫描一遍，得到长度为2n+1的P序列，第二遍扫描就可以得到最长回文串。时间复杂度为$$O(N)$$，这是我们只需要存储2n+1个长度，因此空间复杂度也为$$O(N)$$。

代码实现如下：

<pre class="language-python">
<code>
def lps_manacher(s):
    n = len(s)
    P = numpy.array([0]*(2*n+1))
    c, r = 0, 0
    for i in range(1, 2*n):
        j = 2*c - i
        P[i] = min(P[j], r-i) if i < r else 0

        while i+1+P[i] < 2*n+1 and i-1-P[i] >= 0:
            if (i+1+P[i]) % 2 == 1 and s[int((i+1+P[i])/2)] != s[int((i-1-P[i])/2)]:
                break
            P[i] += 1
        c, r = (i, i+P[i]) if i+P[i] > r else (c,r)
    ml = 0
    cur = 0
    # 扫描得到最长回文串
    for i in range(2*n+1):
        cur, ml = (i, P[i]) if P[i]>ml else (cur, ml)
    return s[int((cur-ml)/2):int((cur-ml)/2)+ml]
    </code>
</pre>

### 5) 总结
小红找我聊天了，懒得写总结。
