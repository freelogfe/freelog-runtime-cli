# 事件系统

## 概述

事件是状态机状态转换的触发器。系统定义了多种事件类型，每种事件有不同的参数和行为。

## 事件定义

事件定义存储在 `resources/event_definition.json` 中：

```json
[
  {
    "code": "S201",
    "name": "TransactionEvent",
    "description": "one time transaction",
    "params": [
      { "name": "amount", "type": "decimal" },
      { "name": "account", "type": "none" }
    ],
    "singleton": true
  }
]
```

## 事件类型

### 1. SigningEvent（签约事件）

用户签约资源时触发。

| 属性 | 值 |
|------|-----|
| 代码 | S101 |
| 单例 | 是 |
| 参数 | resourceName: 资源名称 |

**示例**：
```
~freelog.SigningEvent("my-resource") => signed
```

### 2. TransactionEvent（交易事件）

用户支付时触发。

| 属性 | 值 |
|------|-----|
| 代码 | S201 |
| 单例 | 是 |
| 参数 | amount: 金额, account: 账户 |

**示例**：
```
~freelog.TransactionEvent("29.99", "self.account") => paid
```

### 3. RelativeTimeEvent（相对时间事件）

相对于当前时间，经过指定时间后触发。

| 属性 | 值 |
|------|-----|
| 代码 | A103 |
| 单例 | 否 |
| 参数 | elapsed: 时间量, timeUnit: 时间单位 |

**时间单位**：year, month, week, day, hour, minute

**示例**：
```
~freelog.RelativeTimeEvent("1", "week") => expired    // 1 周后
~freelog.RelativeTimeEvent("30", "day") => expired    // 30 天后
~freelog.RelativeTimeEvent("1", "month") => expired   // 1 个月后
```

### 4. TimeEvent（定时事件）

在指定时间点触发。

| 属性 | 值 |
|------|-----|
| 代码 | A102 |
| 单例 | 否 |
| 参数 | dateTime: 日期时间 |

**示例**：
```
~freelog.TimeEvent("2024-12-31 23:59") => expired
```

### 5. CycleEndEvent（周期结束事件）

周期结束时触发，可重复。

| 属性 | 值 |
|------|-----|
| 代码 | A101 |
| 单例 | 否 |
| 参数 | cycleCount: 周期数, timeUnit: 时间单位 |

**示例**：
```
~freelog.CycleEndEvent("1", "month") => renew    // 每月周期
~freelog.CycleEndEvent("2", "week") => check     // 每两周周期
```

### 6. ViewCountEvent（查看计数事件）

达到指定查看次数时触发。

| 属性 | 值 |
|------|-----|
| 代码 | S301 |
| 单例 | 是 |
| 参数 | amount: 次数 |

**示例**：
```
~freelog.ViewCountEvent("100") => limit_reached
```

### 7. SettlementEvent（结算事件）

结算完成时触发。

| 属性 | 值 |
|------|-----|
| 代码 | S202 |
| 单例 | 是 |
| 参数 | account: 账户 |

**示例**：
```
~freelog.SettlementEvent("001") => settled
```

## 事件分类

### 按触发方式

| 类型 | 事件 | 说明 |
|------|------|------|
| 用户触发 | TransactionEvent, SigningEvent | 需要用户主动操作 |
| 系统触发 | TimeEvent, RelativeTimeEvent, CycleEndEvent | 系统自动触发 |
| 条件触发 | ViewCountEvent | 满足条件时触发 |

### 按单例性

| 类型 | 事件 | 说明 |
|------|------|------|
| 单例 | TransactionEvent, SigningEvent, ViewCountEvent | 只能触发一次 |
| 非单例 | TimeEvent, RelativeTimeEvent, CycleEndEvent | 可重复触发 |

## 事件参数

### 参数类型

| 类型 | 说明 | 示例 |
|------|------|------|
| string | 字符串 | "resource-name" |
| decimal | 数字 | "29.99", "100" |
| dateTime | 日期时间 | "2024-12-31 23:59" |
| timeUnit | 时间单位 | "day", "week", "month" |
| none | 特殊类型 | "self.account" |

### 环境变量

支持使用环境变量作为参数：

```
self.account    // 当前用户的账户
self.exhibited  // 展示次数
```

## 事件翻译

### 翻译策略

每种事件有对应的翻译策略：

```typescript
// TransactionEventTranslateStrategy
translate4Strategy(event) {
    return `支付 ${event.args.amount} 元，进入 ${event.toState}`;
}

// RelativeTimeEventTranslateStrategy
translate4Strategy(event) {
    return `${event.args.elapsed} ${translateTimeUnit(event.args.timeUnit)}后，进入 ${event.toState}`;
}
```

### 翻译模板

翻译模板存储在 `resources/translate_templates.json`：

```json
{
  "TransactionEvent": {
    "Strategy": "支付 %s 元%s，进入 %s",
    "UnFinish": "支付 %s 元%s，可进入 %s",
    "Finished": "已支付 %s 元%s，进入 %s"
  },
  "RelativeTimeEvent": {
    "Strategy": "于%s%s后的第一个周期点，进入 %s",
    "UnFinish": "%s%s之后，将进入 %s",
    "Finished": "%s%s结束，已进入 %s"
  }
}
```

## 事件处理流程

### 1. 事件触发

```javascript
// 外部系统触发事件
triggerEvent({
    name: 'TransactionEvent',
    args: {
        amount: 29.99,
        account: 'user-account'
    }
});
```

### 2. 事件匹配

```javascript
// 查找匹配的转换
for (let transition of currentState.transitions) {
    if (transition.name === event.name) {
        if (matchArgs(transition.args, event.args)) {
            return transition;
        }
    }
}
```

### 3. 状态转换

```javascript
// 执行状态转换
currentState = transition.toState;

// 记录转换历史
transferHistory.push({
    fromState: oldState,
    toState: currentState,
    event: event,
    time: new Date()
});
```

## 事件哈希

每个事件会生成唯一的哈希码：

```typescript
static generateEventHashCode(event: any): string {
    const crypto = require('crypto');
    const str = JSON.stringify({
        code: event.code,
        state: event.state,
        toState: event.toState,
        index: event.index
    });
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
}
```

## 最佳实践

### 1. 选择合适的事件类型

```
// 一次性支付
~freelog.TransactionEvent("99", "self.account") => purchased

// 订阅续费
~freelog.CycleEndEvent("1", "month") => renew
~freelog.TransactionEvent("9.99", "self.account") => subscribed

// 限时免费
~freelog.RelativeTimeEvent("7", "day") => trial_end
```

### 2. 处理多个事件

```
// 同一状态可以有多个事件
waiting:
    ~freelog.TransactionEvent("10", "self.account") => paid      // 支付
    ~freelog.RelativeTimeEvent("30", "day") => expired           // 超时
```

### 3. 使用周期事件

```
// 每月续费
subscribed[active]:
    ~freelog.CycleEndEvent("1", "month") => renew

renew:
    ~freelog.TransactionEvent("9.99", "self.account") => subscribed
    ~freelog.RelativeTimeEvent("7", "day") => expired            // 宽限期
```

## 下一步

- [API 参考](./07-api-reference.md) - 完整的 API 文档
