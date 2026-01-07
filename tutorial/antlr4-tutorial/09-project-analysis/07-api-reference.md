# API 参考

## 安装

```bash
npm install @freelog/resource-policy-lang
```

## 导入

```javascript
const policy_lang = require('@freelog/resource-policy-lang');
```

## API 列表

### compile(policyText, targetType, targetUrl, env)

编译策略文本为状态机 JSON。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| policyText | string | 策略文本 |
| targetType | string | 目标类型（如 "resource"） |
| targetUrl | string | 目标服务器 URL |
| env | string | 环境（"dev" 或 "prod"） |

**返回值**：
```typescript
{
    state_machine: StateMachine;  // 状态机对象
    warnings: string[];           // 警告信息
    warningObjects: object[];     // 警告对象
    errors: string[];             // 错误信息
    errorObjects: object[];       // 错误对象
}
```

**示例**：
```javascript
const policyText = `
for public

initial[active]:
    ~freelog.RelativeTimeEvent("1","week") => finish

finish:
    terminate
`;

const result = await policy_lang.compile(
    policyText,
    'resource',
    'http://api.freelog.com',
    'prod'
);

if (result.errors.length === 0) {
    console.log('编译成功:', result.state_machine);
} else {
    console.error('编译失败:', result.errors);
}
```

---

### decompile(stateMachine)

将状态机 JSON 反编译为策略文本。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| stateMachine | object | 状态机对象 |

**返回值**：`string` - 策略文本

**示例**：
```javascript
const stateMachine = result.state_machine;
const policyText = policy_lang.decompile(stateMachine);
console.log(policyText);
```

---

### reformat(policyText)

格式化策略文本。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| policyText | string | 策略文本 |

**返回值**：
```typescript
{
    policyText: string;      // 格式化后的文本
    positions: object[];     // 位置信息
    errors: string[];        // 错误信息
    errorObjects: object[];  // 错误对象
}
```

**示例**：
```javascript
const result = await policy_lang.reformat(policyText);
console.log(result.policyText);
```

---

### report(contract)

生成合约报告（中文描述）。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| contract | object | 合约对象（包含 audiences 和 states） |

**返回值**：
```typescript
{
    audienceInfos: AudienceInfo[];  // 受众信息
    fsmInfos: FSMInfo[];            // 状态机信息
    content: string;                // 完整的文本描述
}
```

**示例**：
```javascript
const report = policy_lang.report(result.state_machine);
console.log(report.content);

// 输出:
// 所有人
//
// 初始状态[授权]：
//   1 周后，进入 finish
// finish：
//   终止
```

---

### reportAudiences(audiences)

生成受众报告。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| audiences | Audience[] | 受众列表 |

**返回值**：`string` - 受众描述

**示例**：
```javascript
const audiences = [
    { name: 'public', type: 'public' },
    { name: '12345', type: 'userId' }
];
const report = policy_lang.reportAudiences(audiences);
console.log(report);  // "所有人，用户 12345"
```

---

### transfer(states, fsmTransfers, transferSetMapJson)

处理状态转换。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| states | object | 状态集合 |
| fsmTransfers | FsmTransfer[] | 转换记录列表 |
| transferSetMapJson | object | 转换集合映射（可选） |

**返回值**：转换结果对象

**示例**：
```javascript
const transfers = [
    { toState: 'initial', time: '2024-01-01', isFirst: true },
    { toState: 'auth', time: '2024-01-08', fromState: 'initial', event: { name: 'RelativeTimeEvent' } }
];

const result = policy_lang.transfer(
    stateMachine.states,
    transfers
);
```

---

### parseRoutes(states, stateName, routes, route)

解析状态机路由。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| states | object | 状态集合 |
| stateName | string | 起始状态名 |
| routes | array | 路由结果数组（输出） |
| route | array | 当前路由（输入） |

**示例**：
```javascript
const routes = [];
policy_lang.parseRoutes(stateMachine.states, 'initial', routes, []);
console.log(routes);
```

---

### compareRoutes(routes, routesB, options)

比较两个状态机的路由。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| routes | array | 路由 A |
| routesB | array | 路由 B |
| options | object | 比较选项（可选） |

**示例**：
```javascript
policy_lang.compareRoutes(routesA, routesB, { strict: true });
```

---

### cleanUpRoutes(routes)

清理路由（去重等）。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| routes | array | 路由数组 |

**返回值**：清理后的路由数组

---

### translateState(stateName)

翻译状态名。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| stateName | string | 状态名 |

**返回值**：`string` - 翻译后的状态名

**示例**：
```javascript
const name = policy_lang.translateState('initial');
console.log(name);  // "初始状态"
```

---

### translateEventArg(eventName, argName, argValue)

翻译事件参数。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| eventName | string | 事件名 |
| argName | string | 参数名 |
| argValue | string | 参数值 |

**返回值**：`string` - 翻译后的参数值

**示例**：
```javascript
const value = policy_lang.translateEventArg('RelativeTimeEvent', 'timeUnit', 'week');
console.log(value);  // "周"
```

---

### generateEventHashCode(event)

生成事件哈希码。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| event | object | 事件对象 |

**返回值**：`string` - 8 位哈希码

**示例**：
```javascript
const hash = policy_lang.generateEventHashCode({
    code: 'A103',
    state: 'initial',
    toState: 'auth',
    index: 0
});
console.log(hash);  // "96d450bb"
```

## 类型定义

### StateMachine

```typescript
interface StateMachine {
    audiences: Audience[];
    declarations: Declarations;
    states: Record<string, State>;
    description: {
        symbolArgs: {
            envArgs: string[]
        }
    }
}
```

### Audience

```typescript
interface Audience {
    name: string;
    type: 'public' | 'userId' | 'email';
}
```

### State

```typescript
interface State {
    serviceStates: string[];
    transitions: Transition[];
    isInitial?: boolean;
}
```

### Transition

```typescript
interface Transition {
    name: string;
    service: string;
    path?: string;
    toState: string;
    args: Record<string, any>;
    code: string;
    description: string;
    isSingleton: boolean;
    id?: string;
}
```

## 错误处理

```javascript
const result = await policy_lang.compile(policyText, 'resource', url, 'dev');

if (result.errors.length > 0) {
    for (const error of result.errorObjects) {
        console.error(`错误: 第${error.line}行第${error.column}列 - ${error.msg}`);
    }
}

if (result.warnings.length > 0) {
    for (const warning of result.warningObjects) {
        console.warn(`警告: ${warning.msg}`);
    }
}
```
