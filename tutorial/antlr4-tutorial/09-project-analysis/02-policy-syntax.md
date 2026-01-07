# 策略语言语法

## 语法结构

策略语言由三部分组成：

```
策略 = 受众声明 + 全局声明（可选）+ 状态机定义
```

## 完整示例

```
for public                              // 受众声明

always active                           // 全局声明（可选）

initial[active]:                        // 初始状态
    ~freelog.RelativeTimeEvent("1","week") => get_auth

get_auth:                               // 中间状态
    ~freelog.TransactionEvent("29.99","self.account") => auth

auth[active]:                           // 授权状态
    ~freelog.RelativeTimeEvent("1","month") => finish

finish:                                 // 终止状态
    terminate
```

## 语法详解

### 1. 受众声明（Audience）

定义谁可以使用这个策略。

```
for <audience1>, <audience2>, ...
```

**受众类型：**

| 类型 | 示例 | 说明 |
|------|------|------|
| public | `for public` | 所有人 |
| userId | `for 12345` | 指定用户 ID |
| email | `for user@example.com` | 指定邮箱 |

**示例：**
```
for public                          // 所有人
for public, 12345                   // 所有人 + 指定用户
for user@example.com, 67890         // 指定邮箱 + 指定用户
```

### 2. 全局声明（Declaration）

定义全局常量和表达式。

#### 服务状态常量

```
always <service_state>
```

**示例：**
```
always active          // 所有状态都有 active 服务状态
always testActive      // 所有状态都有 testActive 服务状态
```

#### 表达式定义

```
<func_name>(<args>) = <expression>
```

**示例：**
```
price() = 10 + 5                    // 无参数
discount(rate) = price() * rate     // 有参数
```

### 3. 状态定义（State Definition）

定义状态机的状态和转换。

```
<state_name>[<service_states>]:
    <transition1>
    <transition2>
    ...
```

**组成部分：**

| 部分 | 说明 | 示例 |
|------|------|------|
| state_name | 状态名称 | `initial`, `auth`, `finish` |
| service_states | 服务状态（可选） | `[active]`, `[active, testActive]` |
| transitions | 状态转换列表 | 见下文 |

**特殊状态名：**
- `initial`：初始状态（必须存在）

**示例：**
```
initial[active]:                    // 初始状态，有 active 服务状态
    ~freelog.Event1() => state2

state2:                             // 普通状态，无服务状态
    ~freelog.Event2() => state3

state3[active]:                     // 有 active 服务状态
    terminate                       // 终止
```

### 4. 状态转换（Transition）

定义事件触发的状态变化。

```
~<service>.<event_name>(<args>) => <target_state>
```

**组成部分：**

| 部分 | 说明 | 示例 |
|------|------|------|
| service | 服务名 | `freelog` |
| event_name | 事件名 | `TransactionEvent` |
| args | 事件参数 | `"29.99", "self.account"` |
| target_state | 目标状态 | `auth` |

**特殊转换：**
- `terminate`：终止状态机

### 5. 事件类型

系统支持的事件类型：

| 事件 | 代码 | 说明 | 参数 |
|------|------|------|------|
| SigningEvent | S101 | 签约事件 | resourceName |
| TransactionEvent | S201 | 支付事件 | amount, account |
| SettlementEvent | S202 | 结算事件 | account |
| TimeEvent | A102 | 定时事件 | dateTime |
| RelativeTimeEvent | A103 | 相对时间事件 | elapsed, timeUnit |
| CycleEndEvent | A101 | 周期结束事件 | cycleCount, timeUnit |
| ViewCountEvent | S301 | 查看计数事件 | amount |

**时间单位：**
- `year` - 年
- `month` - 月
- `week` - 周
- `day` - 天
- `hour` - 小时
- `minute` - 分钟

**示例：**
```
// 支付 29.99 元
~freelog.TransactionEvent("29.99", "self.account") => paid

// 1 周后
~freelog.RelativeTimeEvent("1", "week") => expired

// 指定时间
~freelog.TimeEvent("2024-12-31 23:59") => expired

// 每 2 个月周期
~freelog.CycleEndEvent("2", "month") => renew
```

### 6. 服务状态（Service State）

服务状态表示当前状态的业务含义：

| 服务状态 | 类型 | 说明 |
|----------|------|------|
| active | authorization | 已授权 |
| testActive | testAuthorization | 测试授权 |

**示例：**
```
initial[active]:           // 初始状态就有授权
    ...

waiting:                   // 等待状态，无授权
    ...

auth[active]:              // 授权状态
    ...
```

## 完整语法示例

### 示例 1：免费试用 + 付费订阅

```
for public

initial[active]:
    ~freelog.RelativeTimeEvent("7", "day") => trial_end    // 免费试用 7 天

trial_end:
    ~freelog.TransactionEvent("9.99", "self.account") => subscribed  // 支付 9.99 元

subscribed[active]:
    ~freelog.RelativeTimeEvent("1", "month") => expired    // 订阅 1 个月

expired:
    terminate
```

### 示例 2：一次性购买

```
for public

initial:
    ~freelog.TransactionEvent("99", "self.account") => purchased

purchased[active]:
    terminate    // 永久授权
```

### 示例 3：多条件授权

```
for public, premium_users

always testActive

initial[active]:
    ~freelog.SigningEvent("resource1") => signed

signed:
    ~freelog.TransactionEvent("10", "self.account") => paid
    ~freelog.RelativeTimeEvent("30", "day") => expired     // 30 天后过期

paid[active]:
    ~freelog.CycleEndEvent("1", "month") => renew          // 每月续费

renew:
    ~freelog.TransactionEvent("10", "self.account") => paid
    ~freelog.RelativeTimeEvent("7", "day") => expired      // 7 天宽限期

expired:
    terminate
```

## 语法规则（ANTLR4）

```antlr
policy : audience_section? declaration_section? state_section ;

audience_section : 'for' audience (',' audience)* ;
audience : 'public' | ID | EMAIL ;

declaration_section : declaration+ ;
declaration : 'always' ID | expression_definition ;

state_section : state_definition+ ;
state_definition : state_name service_states? ':' transition* ;
state_name : ID | 'initial' ;
service_states : '[' ID (',' ID)* ']' ;

transition : event '=>' state_name | 'terminate' ;
event : '~' service '.' event_name '(' event_args? ')' ;
```

## 下一步

- [状态机模型](./03-state-machine.md) - 了解编译后的状态机结构
- [编译流程](./04-compile-process.md) - 了解编译的详细流程
