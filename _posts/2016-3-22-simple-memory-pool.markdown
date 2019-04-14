---
layout: post
title: 简单内存池
---

内存池，Memory Pool，是一种高效的内存分配方式。它通过一次性向操作系统申请大块内存，用户直接从池中申请内存而不用释放，从而避免了不断申请、释放内存造成的内存碎片而降低软件性能。


## 1. 内存池功能
一个比较完善的内存池至少需要具备一下功能：

* 内存池的创建与销毁
* 当内存池容量不够时，自身自动扩容
* 向内存池申请内存（通常会考虑字节对齐）
* 『释放』内存，将使用的内存池归还给内存池
* 整理内存块，将不用的大内存块归还给操作系统

在设计内存池时通常需要考虑一下几个问题：

### 1.1 内存池需要设计成单例的吗？

对于一个通用的内存池来说，单例是比较合理的。

但是也有一些场景中，内存池并不是用于全局的，而是有各自的作用域和生命周期。如nginx中为每次连接开辟一个内存池；如我们可以为每个窗口创建一个内存池，窗口销毁后内存池也跟着释放了。


### 1.2 内存池是否要加锁？
内存分配不可避免地需要对内存的管理指针进行操作，因此如果内存池用在多线程应用程序中就需要考虑，是否需通过加锁等进行同步。

### 1.3 内存池的字节对齐
为了效率，内存池在设计时通常会考虑机器字长对齐。

### 1.4 申请的内存是否需要归还给内存池？
从内存池中申请的内存释放是一个比较复杂的问题，因为需要对内存进行重排，一般会用到`AVL树`或`B树`等。但是存在一些场景，内存池可以起到一个GC的作用。在这些场景中，需要频繁申请内存，且其生命周期很短，于是可以用一个简单内存池来管理内存，程序只用申请内存不用考虑释放问题。


## 2. 简单内存池实现
本文的简单内存池即是模仿Nginx的内存池，去掉了一些回调处理、大内存申请，最后得到一个简化后的内存池。特点：

* 适用于频繁申请小内存
* 申请的内存不用释放（意味着不能适用于申请很多内存情况）
* 销毁内存池时释放所有内存

为了效率（其实是因为，用C更显Bigger高），这里采用C实现。

该内存池是由一些列block组成，每个block默认大小为`MEM_POOL_BLOCK_DEFAULT_SIZE`，这些block以链表方式连接。内存池创建时，只会生成一个block，内存池不够时，自动扩充。


<pre class="language-c">
<code>
#define MEM_POOL_BLOCK_DEFAULT_SIZE 1024

typedef struct mem_block_s mem_block_t;
typedef struct mem_pool_s mem_pool_t;

struct mem_block_s {
    char *last;	         /* 空闲内存start */
    char *end;          /* 该block最后地址 */
    mem_block_t *next;  /* 下一个block指针 */
};

struct mem_pool_s {
    mem_block_t *head;			/* 首个block */
    mem_block_t *current;      /* 当前可分配内存block */
};
</code>
</pre>

内存池的接口如下：

<pre class="language-c">
<code>
mem_block_t *mem_block_create();
void mem_block_destroy(mem_block_t *blk);
size_t mem_pool_block_num(mem_pool_t *pool);

/* 用户接口 */ 
mem_pool_t *mem_pool_create();
void mem_pool_destroy(mem_pool_t *pool);
void *mem_pool_alloc(mem_pool_t *pool, size_t n); /* 申请的内存没有初始化为0 */
</code>
</pre>


<pre class="language-c">
<code>
mem_block_t* mem_block_create(){
    char*           m;
    mem_block_t*    blk;

    m = (char*)malloc(MEM_POOL_BLOCK_DEFAULT_SIZE + sizeof(mem_block_t));
    if(!m){
        return 0;
    }

    blk = (mem_block_t*)m;
    blk->last = m + sizeof(mem_block_t);
    blk->end = m + MEM_POOL_BLOCK_DEFAULT_SIZE + sizeof(mem_block_t);
    blk->next = 0;
    return blk;
}

void mem_block_destroy(mem_block_t* blk){
    if(blk){
        free(blk);
    }
}

mem_pool_t* mem_pool_create(){
    mem_pool_t*     pool;
    mem_block_t*    blk;

    pool = (mem_pool_t*)malloc(sizeof(mem_pool_t));
    if(!pool){
        return 0;
    }

    blk = mem_block_create();
    if(!blk){
        free(pool);
        return 0;
    }

    pool->head      = blk;
    pool->current   = blk;

    return pool;
}

void mem_pool_destroy(mem_pool_t* pool){
    mem_block_t*     cur;
    mem_block_t*    next;

    if(!pool){
        return;
    }

    cur = pool->head;
    while(cur){
        next = cur->next;
        mem_block_destroy(cur);
        cur = next;
    }

    free(pool);
}

/* 为了简单，没有考虑到地址对齐 */
void* mem_pool_alloc(mem_pool_t* pool, size_t n){
    char*           m;
    int             is_size_valid;
    int             left_size;
    mem_block_t*    blk;

    is_size_valid = ( n<=0 )||(n > MEM_POOL_BLOCK_DEFAULT_SIZE);
    if(!pool || !pool->current || is_size_valid){
        return 0;
    }

    left_size = pool->current->end - pool->current->last;
    if(n > left_size){
        blk = mem_block_create();
        if(!blk){
            return 0;
        }

        pool->current->next = blk;
        pool->current = blk;
        m = blk->last;
        blk->last += n;
        return m;
    }

    m = pool->current->last;
    pool->current->last += n;
    return m;
}


size_t mem_pool_block_num(mem_pool_t* pool){
    mem_block_t*    blk;
    size_t          cnt = 0;
    if(!pool){
        return 0;
    }
    blk = pool->head;
    while(blk){
        cnt++;
        blk = blk->next;
    }
    return cnt;
}
</code>
</pre>

这个实现真的相当简单，这里就不多费唇舌解释了。

## 3. 下一步：改进它
上面实现了一个简单内存池，虽然有很多缺点但是却在很多地方可以直接用。但是，作为一个立志写出伟大程序的我们，怎么能止于此呢！！不用AVLTree、BTree秀一把，怎么对得起那些死去的bug？

所以下一步，当然需要把那些简化掉的功能加上，如加锁、内存释放、地址对齐等等。


---

_如果您觉得文章对您有用能够解决您的问题，欢迎您通过扫码进行打赏支持，谢谢！_

<img src="/public/post/img/alipay.jpg" style="width: 200px;margin:auto auto;"/>

