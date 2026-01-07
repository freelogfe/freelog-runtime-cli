# 状态机模型

## 概述

策略语言编译后生成的是一个**有限状态机（FSM）**的 JSON 表示。

## 数据结构

### StateMachine（状态机）

```typescript
interface StateMachine {
    audiences: Audience[];           // 目标用户
    declarations: Declarations;      // 声明
    states: Record<string, State>;   // 状态集合
    description: {
        symbolArgs: {
            envArgs: string[]        // 环境变量
        }
    }
}
```

### Audience（受众）

```typescript
interface Audience {
    name: string;    // 名称
    type: string;    // 类型：public | userId | email
}
```

### Declarations（声明）

```typescript
interface Declarations {
    serviceStates: ServiceState[];           // 服务状态定义
    serviceStateConstants: ServiceStateConstant[];  // 服务状态常量
    expressions: Expression[];               // 表达式定义
}
```

### State（状态）

```typescript
interface State {
    serviceStates: string[];     // 服务状态列表
    transitions: Transition[];   // 状态转换列表
    isInitial?: boolean;         // 是否是初始状态
}
```

### Transition（状态转换）

```typescript
interface Transition {
    name: string;        // 事件名
    service: string;     // 服务名
    path?: string;       // 事件路径
    toState: string;     // 目标状态
    args: {              // 事件参数
        [key: string]: any;
    };
    code: string;        // 事件代码
    description: string; // 事件描述
    isSingleton: boolean; // 是否是单例事件
    id?: string;         // 事件 ID（哈希）
}
```

## 完整示例

### 输入（策略文本）

```
for public

initial[active]:
    ~freelog.RelativeTimeEvent("1","week") => get_auth

get_auth:
    ~freelog.TransactionEvent("29.99","self.account") => auth

auth[active]:
    ~freelog.RelativeTimeEvent("1","month") => finish

finish:
    terminate
```

### 输出（状态机 JSON）

```json
{
    "state_machine": {
        "audiences": [
            {
                "name": "public",
                "type": "public"
            }
        ],
        "declarations": {
            "serviceStates": [
                {
                    "name": "active",
                    "type": "authorization"
                }
            ],
            "serviceStateConstants": [],
            "expressions": []
        },
        "states": {
            "initial": {
                "transitions": [
                    {
                        "toState": "get_auth",
                        "service": "freelog",
                        "name": "RelativeTimeEvent",
                        "args": {
                            "elapsed": 1,
                            "timeUnit": "week"
                        },
                        "code": "A103",
                        "description": "fired when certain amount of time elapsed",
                        "isSingleton": false,
                        "id": "96d450bb"
                    }
                ],
                "serviceStates": ["active"],
                "isInitial": true
            },
            "get_auth": {
                "transitions": [
                    {
                        "toState": "auth",
                        "service": "freelog",
                        "name": "TransactionEvent",
                        "args": {
                            "amount": 29.99,
                            "account": "self.account"
                        },
                        "code": "S201",
                        "description": "one time transaction",
                        "isSingleton": true,
                        "id": "fa2c31b6"
                    }
                ],
                "serviceStates": []
            },
            "auth": {
                "transitions": [
                    {
                        "toState": "finish",
                        "service": "freelog",
                        "name": "RelativeTimeEvent",
                        "args": {
                            "elapsed": 1,
                            "timeUnit": "month"
                        },
                        "code": "A103",
                        "description": "fired when certain amount of time elapsed",
                        "isSingleton": false,
                        "id": "007d1d54"
                    }
                ],
                "serviceStates": ["active"]
            },
            "finish": {
                "transitions": [],
                "serviceStates": []
            }
        },
        "description": {
            "symbolArgs": {
                "envArgs": ["self.account"]
            }
        }
    },
    "warnings": [],
    "warningObjects": [],
    "errors": [],
    "errorObjects": []
}
```

## 状态机可视化

```
┌─────────────────────────────────────────────────────────────────┐
│                        状态机流程图                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐                                          │
│   │    initial      │  serviceStates: [active]                 │
│   │   (初始状态)     │  isInitial: true                         │
│   └────────┬────────┘                                          │
│            │                                                    │
│            │ RelativeTimeEvent                                  │
│            │ elapsed: 1, timeUnit: week                         │
│            │ (1 周后触发)                                        │
│            v                                                    │
│   ┌─────────────────┐                                          │
│   │    get_auth     │  serviceStates: []                       │
│   │   (等待支付)     │  (无授权)                                 │
│   └────────┬────────┘                                          │
│            │                                                    │
│            │ TransactionEvent                                   │
│            │ amount: 29.99, account: self.account               │
│            │ (支付 29.99 元)                                     │
│            v                                                    │
│   ┌─────────────────┐                                          │
│   │      auth       │  serviceStates: [active]                 │
│   │   (已授权)       │  (有授权)                                 │
│   └────────┬────────┘                                          │
│            │                                                    │
│            │ RelativeTimeEvent                                  │
│            │ elapsed: 1, timeUnit: month                        │
│            │ (1 个月后触发)                                      │
│            v                                                    │
│   ┌─────────────────┐                                          │
│   │     finish      │  serviceStates: []                       │
│   │    (终止)       │  transitions: []                          │
│   └─────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 状态机执行逻辑

### 1. 初始化

```javascript
// 创建合约时，状态机从 initial 状态开始
currentState = "initial"
```

### 2. 事件触发

```javascript
// 当事件发生时，检查当前状态的 transitions
for (transition of states[currentState].transitions) {
    if (transition.name === eventName && matchArgs(transition.args, eventArgs)) {
        currentState = transition.toState
        break
    }
}
```

### 3. 授权检查

```javascript
// 检查当前状态是否有授权
function isAuthorized() {
    return states[currentState].serviceStates.includes("active")
}
```

### 4. 终止检查

```javascript
// 检查是否终止
function isTerminated() {
    return states[currentState].transitions.length === 0
}
```

## 事件类型详解

### 单例事件（Singleton）

单例事件只能触发一次：

```json
{
    "name": "TransactionEvent",
    "isSingleton": true
}
```

### 非单例事件（Non-Singleton）

非单例事件可以重复触发：

```json
{
    "name": "RelativeTimeEvent",
    "isSingleton": false
}
```

## 服务状态含义

| 服务状态 | 类型 | 含义 |
|----------|------|------|
| active | authorization | 用户已获得授权，可以访问资源 |
| testActive | testAuthorization | 用户获得测试授权 |
| 无 | - | 用户未获得授权，不能访问资源 |

## 下一步

- [编译流程](./04-compile-process.md) - 了解编译的详细流程
- [工具类详解](./05-tools.md) - 了解各个工具类的功能
