---
layout: post
title: 算法 - Regular Expression Matching
---

## 1.题目:
<pre>
'.' Matches any single character.
'*' Matches zero or more of the preceding element.
The matching should cover the entire input string (not partial).
The function prototype should be:
bool isMatch(const char *s, const char *p)

Some examples:
isMatch("aa","a") → false
isMatch("aa","aa") → true
isMatch("aaa","aa") → false
isMatch("aa", "a*") → true
isMatch("aa", ".*") → true
isMatch("ab", ".*") → true
isMatch("aab", "c*a*b") → true
</pre>

## 2. 思路与解法:
看到这个题目，我首先想到的是，可以画一个n*m的表格来表示匹配关系，如果完全匹配则存在一个左上角到右下角的路径。
当然我们在计算的时候不能计算每个表格的值，需要跳过一些，而且在编码中并不需要存储这张表。
很容易根据这种思想写出代码，而且效率也还不错：

<pre class="language-python">
<code>
bool isMatch(char* s, char* p) {
    int i = 0, j = 0, r;
    while(*(p+j) != '\0') {
        if(*(p+j) == '.' && *(s+i)!='\0') {i++; j++; continue;}
        else if(*(p+j) == '*') {
            if(*(p+j+1)==*(p+j-1) && *(p+j+2)=='*') {j+=2; continue;}
            r = isMatch(s+i, p+j+1) || isMatch(s+i-1, p+j+1) ;
            if((*(s+i-1)==*(s+i) || *(p+j-1) == '.') && *(s+i)!='\0') {
                r = r || isMatch(s+i+1, p+j) || isMatch(s+i+1, p+j+1);
            }
            return r;
        } else if(*(s+i) == *(p+j)) {i++; j++; continue;}
        else if(*(s+i) != *(p+j) && *(p+j+1) == '*') {j+=2; continue;}
        else return false;
    }
    if(*(s+i)=='\0' && *(p+j)=='\0') return true;
    else return false;
}

// 测试用例:
    printf("[%d]%d==%d\n",i++,1, isMatch("", ""));
    printf("[%d]%d==%d\n",i++,0, isMatch("", "."));
    printf("[%d]%d==%d\n",i++,1, isMatch("abc", "abc"));
    printf("[%d]%d==%d\n",i++,0, isMatch("aa", "a"));
    printf("[%d]%d==%d\n",i++,1, isMatch("aaa", "aaa"));
    printf("[%d]%d==%d\n",i++,1, isMatch("aa", ".a"));
    printf("[%d]%d==%d\n",i++,1, isMatch("aaa", "a*a"));
    printf("[%d]%d==%d\n",i++,1, isMatch("aa", ".*"));
    printf("[%d]%d==%d\n",i++,1, isMatch("ab", ".*")); // *
    printf("[%d]%d==%d\n",i++,1, isMatch("aab", "c*a*b*"));
    printf("[%d]%d==%d\n",i++,0, isMatch("ab", ".*c"));
    printf("[%d]%d==%d\n",i++,0, isMatch("aaba", "ab*a*c*a"));
    printf("[%d]%d==%d\n",i++,0, isMatch("aba", "a*c*a"));
    printf("[%d]%d==%d\n",i++,1, isMatch("a", "a*a"));
    printf("[%d]%d==%d\n",i++,0, isMatch("a", ".*..a*"));
    printf("[%d]%d==%d\n",i++,0, isMatch("aaaaaaaaaaaaa", "a*a*a*a*a*a*a*a*a*c"));
</code>
</pre>

有几个地方需要注意：

1）表达式可能出现`a*a*a*a*a*a*`这样的情况，事实上`a*==a*a*`，需要特出处理，否则就会走过很多无需走的分支路径，计算会慢很多。

2）使用递归的思想，很容易简化思路。
