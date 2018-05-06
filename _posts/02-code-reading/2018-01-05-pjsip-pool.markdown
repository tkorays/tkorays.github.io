---
layout: post
title: PJSIP-内存池
---

## 1. 内存池
PJSIP的内存池实现和其他库的实现类似，内存池是以一个个内存块方式组织，内存块以链表方式连接，在申请内存时，遍历内存块，查找可以有足够内存的内存块，如果没有找到，则新建一个内存块。在此基础上，PJSIP的内存池还实现了内存工厂和策略方式，内存池本身的内存申请都需要根据策略在工厂中申请。

PJSIP总内存池定义如下：
<pre><code class="language-c">struct pj_pool_t
{
    PJ_DECL_LIST_MEMBER(struct pj_pool_t);  /**< Standard list elements.    */
    char	    obj_name[PJ_MAX_OBJ_NAME];  /** Pool name */

    pj_pool_factory *factory;  /** Pool factory. */
    void	    *factory_data;/** Data put by factory */

    pj_size_t	    capacity; /** Current capacity allocated by the pool. */

    /** Size of memory block to be allocated when the pool runs out of memory */
    pj_size_t	    increment_size;
    /** List of memory blocks allcoated by the pool. */
    pj_pool_block   block_list;

    /** The callback to be called when the pool is unable to allocate memory. */
    pj_pool_callback *callback;
};
</code></pre>
* 不同内存池是以双向链表方式组织管理。
* obj_name内存池的名称。
* factory内存申请工厂，内部申请内存块实际上时从factory中申请。
* capacity表示由内存池（非用户）申请的内存大小，内存不足时可以以单个块动态增加。
* increment_size表示每个block内存大小。
* block_list内存块列表。
* callback内存申请失败时的回调，用于处理exception。


## 2. 内存块
PJSIP的内存池是按照块（block来组织的），所有的块以双向链表方式管理：
<pre><code class="language-c">typedef struct pj_pool_block
{
    PJ_DECL_LIST_MEMBER(struct pj_pool_block);  /**< List's prev and next.  */
    unsigned char    *buf;                      /**< Start of buffer.       */
    unsigned char    *cur;                      /**< Current alloc ptr.     */
    unsigned char    *end;                      /**< End of buffer.         */
} pj_pool_block;

/* PJ_DECL_LIST_MEMBER在list.h中定义 */
#define PJ_DECL_LIST_MEMBER(type)                       \
                                   /** List @a prev. */ \
                                   type *prev;          \
                                   /** List @a next. */ \
                                   type *next 
</code></pre>
内存块有3个指针用于管理内存块内的内存分配，`buf`是内存块的开始，`end`是内存块的结束，`cur`表示当前分配的内存地址。

内存块申请好（`pj_pool_create_block`）后，插入内存池中的内存块列表。

## 3. 策略
策略定义了如何去申请内存块。
<pre><code class="language-c">typedef struct pj_pool_factory_policy
{
    /** 为内存池申请内存块 */
    void* (*block_alloc)(pj_pool_factory *factory, pj_size_t size);

    /** 释放内存块 */
    void (*block_free)(pj_pool_factory *factory, void *mem, pj_size_t size);

    /** 内存申请失败时的回调 */
    pj_pool_callback *callback;

    /**
     * Option flags.
     */
    unsigned flags;
} pj_pool_factory_policy;

/* 定义一个策略，如使用new分配内存 */
PJ_DEF_DATA(pj_pool_factory_policy) pj_pool_factory_default_policy = 
{
    &operator_new,
    &operator_delete,
    &default_pool_callback,
    0
};
PJ_DEF(const pj_pool_factory_policy*) pj_pool_factory_get_default_policy(void)
{
    return &pj_pool_factory_default_policy;
}
</code></pre>

## 4. 内存工厂
内存池必需由工厂创建，内存工厂不仅提供了内存池创建释放等内存管理的接口，还提供管理内存池生命周期的策略。一个内存工厂的实现如`pj_caching_pool`。

PJSIP的内存池实现上可扩展，应用可以通过创建自己的内存工厂以定义自己的策略。内存工厂主要定义了：

* policy，内存池工厂策略
* create_pool，创建一个新的内存池的方法
* release_pool，释放内存池的方法

其他方法如内存块如何申请，都是通过策略来实现。

简而言之，`工厂管理内存池，策略实现块、内存的实现细节`！使用何种策略需要程序自己决定。
<pre><code class="language-c">struct pj_pool_factory
{
    /** Memory pool policy. */
    pj_pool_factory_policy policy;

    /*  创建一个内存池，并初始化第一个块（大小为initial_size），
    	后续的内存块大小按照increment_size分配
     */
    pj_pool_t*	(*create_pool)( pj_pool_factory *factory,
				const char *name,
				pj_size_t initial_size, 
				pj_size_t increment_size,
				pj_pool_callback *callback);

    /** 释放内存池，并将内存归还给工厂. */
    void (*release_pool)( pj_pool_factory *factory, pj_pool_t *pool );

    /** 注册的dump函数 */
    void (*dump_status)( pj_pool_factory *factory, pj_bool_t detail );

    /** [可选]注册的内存块的申请函数 */
    pj_bool_t (*on_block_alloc)(pj_pool_factory *factory, pj_size_t size);

    /** [可选]注册的内存块释放函数 */
    void (*on_block_free)(pj_pool_factory *factory, pj_size_t size);
};

</code></pre>

## 5. 内存申请
内存直接从内存池中的内存块申请，内存块是由内存策略的申请函数提供。因此你的内存是从堆、静态空间、栈上申请都有可能，这个是由策略决定的！
<pre><code class="language-c">PJ_IDEF(void*) pj_pool_alloc_from_block( pj_pool_block *block, pj_size_t size )
{
    /* The operation below is valid for size==0. 
     * When size==0, the function will return the pointer to the pool
     * memory address, but no memory will be allocated.
     */
    if (size & (PJ_POOL_ALIGNMENT-1)) {
	size = (size + PJ_POOL_ALIGNMENT) & ~(PJ_POOL_ALIGNMENT-1);
    }
    if ((pj_size_t)(block->end - block->cur) >= size) {
	void *ptr = block->cur;
	block->cur += size;
	return ptr;
    }
    return NULL;
}
PJ_IDEF(void*) pj_pool_alloc( pj_pool_t *pool, pj_size_t size)
{
    void *ptr = pj_pool_alloc_from_block(pool->block_list.next, size);
    if (!ptr)
	ptr = pj_pool_allocate_find(pool, size);
    return ptr;
}
</code></pre>

## 6. 内存对齐
PJSIP在申请内存的时候会自动保证字节对齐：
<pre><code class="language-c">/* pool.h */
#ifndef PJ_POOL_ALIGNMENT
#   define PJ_POOL_ALIGNMENT    4
#endif

/* pool.c */
#define ALIGN_PTR(PTR,ALIGNMENT)    (PTR + (-(pj_ssize_t)(PTR) & (ALIGNMENT-1)))

block->cur = ALIGN_PTR(block->buf, PJ_POOL_ALIGNMENT);
</code></pre>

## 7. buffer内存池
PJSIP提供了一种在buffer上创建内存池的机制，可以先创建一块buffer，内存池以该块内存分配。结束后并不需要释放内存池。见头文件`pj/pool_buf.h`。
<pre><code class="language-c">PJ_DECL(pj_pool_t*) pj_pool_create_on_buf(const char *name,
                      void *buf,
                      pj_size_t size);
/* demo */
char buffer[500];
pj_pool_t *pool;
void *p;

pool = pj_pool_create_on_buf("thepool", buffer, sizeof(buffer));

// Use the pool as usual
p = pj_pool_alloc(pool, ...);
...

// No need to release the pool
</code></pre>



