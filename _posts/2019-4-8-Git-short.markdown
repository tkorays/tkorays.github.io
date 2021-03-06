---
layout: post
title: Git简明教程
---

## 1. git
git是一个分布式版本管理系统，熟悉地掌握git的原理已经应用可以极大地提升工作效率。

## 2. 工作目录与储藏区

<img src="/public/post/img/git-dir.png" style="width: 500px;margin:auto auto;"/>

## 3. git命令
### 3.1 添加文件
`git add`将内容修改或者新跟踪的文件添加到暂存区(index)，可以在commit前多次执行。如果你执行了一个修改后，一定要add到暂存区，否则修改无法commit到git仓库。

这个命令会忽略掉.gitignore里面指明忽略到文件，如果想强制添加，可以加上-f参数。`git add`支持简单的正则匹配，在平时可以使用。

如果你使用命令行，特别推荐使用交互模式`git add -i`：

```
*** Commands ***
    1: status       2: update       3: revert       4: add untracked
    5: patch        6: diff         7: quit         8: help
What now> 1
```

可以输入数字或者简写字符执行文件修改add、未跟踪文件add、取消add等操作。比如选择update后，可以输入文件编号`1 2 4 6`添加1、2、4、6这几个文件，也可以用`3-5`表示某一个区间内的文件，用`1 -2`这样的命令可以取消add。

### 3.2 删除文件
`git rm`这个命令的作用是将文件从工作区和暂存区删除，如果需要在工作区保留，需要加参数`git rm --cached`。如果你执行了`git rm`意味着你要将它从仓库中删除，而系统的rm只是将文件从工作目录移除。

### 3.3 提交到仓库
`git commit`命令的作用是将暂存区的修改提交到本地仓库(repository)。最常用到就是`git commit -m xxxx`。

还有一个`git commit -a`或者`git commit -am xxxx`，可以用来让git自动暂存文件，它只会对修改和删除的文件生效，不影响新增的文件。因此如果只是修改或删除文件，可以放心使用。

`git commit --amend`是一个比较常用的命令，可以对上次提交的内容进行修改，也可以对上次提交的log修改。你可以直接修改文件，然后执行`git commit --amend --no-edit`，就可以基于上次的提交修改，不产生一次新的提交。其中`--no-edit`表示不会修改提交记录，如果你需要修改提交记录，那么请不要指定这个选项，git会打开默认编辑器让你修改提交信息。

### 3.4 储藏修改
如果你在当前的A分支做了很多修改，代码写的比较乱，不想直接commit。此时又有一个新的需求，要切换到B分支上开发，这时候你可以用`git stash`来储藏修改。当执行`git stash`后，git会将你修改的文件以及新增的还没有跟踪的文件全都保存起来，放到git维护的栈中。

* `git stash`储藏修改
* `git stash save xxx`，储藏修改并给当前储藏添加说明。
* `git stash list`显示所有的保存记录。
* `git stash pop`弹出栈最上面（最近一次）的储藏。
* `git stash apply stash@{2}`，应用序号为2的stash。
* `git stash drop stash@{2}`，丢弃掉序号为2的stash。

### 3.5 checkout
`git checkout`的作用有两个，切换分支和还原工作目录的文件。

先讲下还原工作目录的文件，如果你修改了一个文件，但是发现很乱想直接丢弃，还原成原来的文件，或者误删除了文件，那可以执行`git checkout`从暂存区或者最近一次commit还原该文件：

```shell
rm a.txt
git checkout a.txt
echo abc >> a.txt
git checkout a.txt
```

也可以指定将某个文件还原成某个节点的：

```shell
git checkout master~2 a.txt
```

如果想检出所有的文本文件，可以使用:

```shell
git checkout -- '*.txt'
```

分支切换执行如下：`git checkout master`，`git checkout -b xxxx`可以从当前分支创建新的分支。

### 3.6 变基
变基(rebase)是一定要熟悉的命令，非常实用，它的作用是从某个commit开始，将后续commit应用到其他的节点基础上。它可以对当前分支应用，也可以跨分支应用，也就是说其实可以做分支合并。

变基对优点在于会让你对历史记录变得非常整洁，缺点也很明显，由于它会对当前分支历史修改，因此并不能取代merge。特别需要强调的是，`千万不要在公共分支上做rebase`，rebase一般在本地或个人分支做（个人分支rebase后需要git push -f才能推送上去）！

通常使用交互式变基`git rebase -i`和`git rebase --continue`来完成。

```shell
git rebase -i HEAD~2
```

上面的命令表示对HEAD最近的两次进行变基，执行完成后，剩下的操作都是交互式完成的:

第一步，git会打开默认的编辑器（一般是vim，用户可以设置），让你去编辑，声明将要执行的操作。

```
  1 pick aaea16b aaaaa
  2 pick 612734a bbbbb
  3
  4 # Rebase 8627642..612734a onto 8627642 (2 commands)
  5 #
  6 # Commands:
  7 # p, pick = use commit
  8 # r, reword = use commit, but edit the commit message
  9 # e, edit = use commit, but stop for amending
 10 # s, squash = use commit, but meld into previous commit
 11 # f, fixup = like "squash", but discard this commit's log message
 12 # x, exec = run command (the rest of the line) using shell
 13 # d, drop = remove commit
```

如上图，你可以执行的操作有：

* pick，选择这个提交，这个意味着你可以删除某些节点
* reword，使用提交但是需要修改commit log
* edit，修改这次提交的内容，git最终应用这些节点的时候会在这个节点停下来，等待修改
* squash，用于压缩多个commit到前面的一个commit中，保留commit log
* fixup，类似squash，但是丢弃commit log
* drop，删除commit

这里你可以修改这些节点的操作、删除节点以及调整顺序，修改完成后保存文件。保存后，git就开始应用这些修改，基于最开始的节点，一个节点一个节点地处理。

* 遇到pick的，则将该节点查到头部
* 遇到drop的，则移除该节点
* 遇到edit的，则停在该节点，用户需要修改，执行`git commit --amend`修改，执行`git add`确认已经解决所有冲突，最后执行`git rebase --continue`继续处理下一个节点。

```shell
git:(master) git rebase -i HEAD~2
Stopped at 612734a...  bbbbb
You can amend the commit now, with

  git commit --amend

Once you are satisfied with your changes, run

  git rebase --continue
```
 
### 3.7 cherry-pick
`git cherry-pick commit-id`用于从其他修改节点应用修改，可以跨分支。这个在合并代码的时候非常有用，如果你想将自己在其他分支的几个修改点合到当前分支，可以用这个命令。如果出现冲突：

* 修改代码解决冲突
* `git add`用来确认冲突文件已经resolved
* `git cherry-pick --continue`继续，完成一次cherry-pick

如果比较棘手，想撤销cherry-pick，执行`git cherry-pick --abort`。

### 3.8 分支合并
分支合并也比较简单，比如切到某个要合并的分支，执行`git merge branchA`就可以将分支branchA的代码合并到当前分支，剩下的就是要解决冲突。

解决冲突主要靠：修改代码、git add、git merge --continue、git merge --abort这几个命令来实现。和git rebase基本相同。

`git merge --squash`和rebase里面的squash很像（该功能也可以由rebase实现），它用于将另一个分支合到当前分支，并且只产生一个commit。对于个人分支上库前合并比较使用，但是对于两个正式分支，不要随便使用。

### 3.9 远端仓库
`git remote`主要用来管理远端仓库。我们的本地的代码库可以添加多个远端仓库。

* `git remote add 远端仓库名 url`
* `git remote remove 远端仓库名`
* `git remote rename oldname newname`

### 3.10 fetch
`git fetch`用来从其他库下载对象。

`git fetch 远端仓库名 分支名`，只下载代码，而并不会在本地创建分支，需要手动checkout才能检出。注意这个命令和`git pull`的区别。


### 3.11 pull
git pull用来从远端拉代码。`git pull [upstream] [branch]`，如果加上`-r`，可以在拉完代码后，在本地做变基。

### 3.12 reset
`git reset`，可以用来还原暂存区。

也可以将HEAD还原到某个commit（`git commit [mode] [commit]`），常用到几个选项：

* `git reset --soft`，不修改暂存区和工作目录，仅仅将HEAD指向某个节点
* `git reset --hard`，修改暂存区和工作目录到该节点，并将HEAD指向该节点
* `git reset --mixed`，修改暂存区，不改变工作目录，并将HEAD指向该节点

使用git reset意味着你需要抛弃后面的一些修改。

比如你发现最近的一个代码拼写错误，可以：

* `git reset --soft HEAD^`，HEAD指向前一次commit，当前暂存区和工作目录不变
* 编辑文件
* git add xxx，将修改加入暂存区
* git commit -c ORIG_HEAD，使用上次的HEAD（也就是reset前HEAD指向）的提交信息重新提交

这个可以做到，使用当前的log修改后重新提交。这个功能也可以通过`git commit --amend`实现。

如果你是想还原很久之前的一个修改，可以使用`git revert`。


### 3.13 revert
git revert的作用是创建一个新的提交，并将代码还原到之前到某个版本。这个命令和reset有点不一样，reset是直接修改HEAD并丢弃后面的commit历史，而revert会保留后续记录。如果在公共分支上，推荐使用revet，因为它会保留记录，便于溯源。

`git revert commit-id`，用于回退某个节点的修改，`git revert -n master~5..master~2`，用于回退某一段修改。

### 3.14 帮助
如果命令不会，就用 `git xxx --help`，肯定能找到答案的。

