# 脚手架需求与设计

## 需求

### 基本需求：创建模版、帮助命令

### 1.本地登录

     1.1 全局登录
     1.2 工作空间登录

### 2.发布作品

     2.1 发布到草稿
     2.2 发布为正式版本

### 3.依赖管理（目前不支持对依赖进行配置，是否要把配置也考虑进去，不管是否支持）

     3.1 添加依赖
       3.1.1 拉取策略展示（如果已经授权了，可以选择忽略下面步骤）
       3.1.2 选择策略签约或上抛
       3.1.3 支付
       <!-- 3.1.4 对依赖进行配置 -->
     3.2 依赖修改
       3.2.1 选择修改方式：合约应用修改、选择新的策略进行签约
       3.2.2 合约应用修改（可上抛）
       3.2.3 选择新的策略进行签约（3.1）
       <!-- 3.2.4 对依赖进行配置 -->
     3.3 删除依赖
     3.4 同步线上作品依赖信息

### 4.信息同步

     4.1 同步作品信息(包括初始化)
     4.2 同步线上作品最新或指定版本的所有信息
     4.3 同步线上作品最新或指定版本的属性、可选配置、更新说明

### 5.作品文件属性分析：上传文件后会分析属性然后可以添加属性

## 设计方案

### 1.本地登录

freelog-cli login -g
freelog-cli login
  参数：-u 用户名 -p 密码
  全称 --username --password

freelog-cli logout -g  
  全称 --global
freelog-cli logout

freelog-cli login status (显示本地和全局)
freelog-cli login status -g （只显示全局）

### 2.发布作品

freelog-cli publish -gu (global user)
freelog-cli publish -wu (workspace user)
freelog-cli publish -d -gu (global user)
草稿参数：-d --draft

freelog-cli publish -d -gu -f (global user)
指定作品文件参数：-f --file

freelog-cli publish -d -gu -f -c (global user)
指定配置文件参数：-c --config

若不带-gu 或 -wu 参数，则提醒用户选择已登录账户，若未登录提醒登录（具体实现逻辑细节尽量不写进来,发布还涉及很多判断，比如版本号判断）

### 3.依赖管理

添加依赖:
freelog-cli add 作品 id 或名称等唯一标识符或 url @版本号或 latest
拉取策略上抛签约支付等过程...

修改依赖：
freelog-cli change 作品 id 或名称等唯一标识符或 url @版本号或 latest
合约应用修改、选择新的策略进行签约过程...

删除依赖：
freelog-cli remove 多个作品 id 或名称等唯一标识符或 url @版本号或 latest，使用空格分割

更新版本： 省略@版本号或 latest 则更新到最新版本，
freelog-cli dep update 多个作品 id 或名称等唯一标识符或 url @版本号或 latest，使用空格分割

查询线上某版本的依赖列表:
freelog-cli dep list -v 版本号或 latest
返回依赖列表与授权状态

同步线上某个版本或最新版本的依赖列表
freelog-cli dep sync -v 版本号或 latest

### 4.信息同步

拉取线上作品信息，并创建或覆盖 freelog.json
freelog-cli sync 作品 id 或名称等唯一标识符或 url @版本号或 latest

同步作品信息包括指定的版本所有信息，如果不带任何参数提示是否同步所有信息到最新版
freelog-cli sync -a -v 版本号或 latest

同步作品信息
freelog-cli sync work

同步所有信息包括依赖
freelog-cli sync -a -v 版本号或 latest

同步属性、配置、更新说明
freelog-cli sync -v 版本号或 latest

### 5.作品文件属性分析

freelog-cli analyze -f 文件路径（不带参数则根据配置文件查找）

### 6.配置文件

根目录创建 freelog.json 文件
6.1 本地配置信息，例如指定文件目录或文件
6.2 作品信息
6.3 属性信息
6.4 配置信息
6.5 更新说明
6.6 依赖信息

### 7.创建模版

freelog-cli init
freelog-cli init -t 模版名称

### 8.帮助命令

freelog-cli --help
freelog-cli -h
具体命令帮助例如：
freelog-cli login --help
freelog-cli publish --help
freelog-cli add --help
