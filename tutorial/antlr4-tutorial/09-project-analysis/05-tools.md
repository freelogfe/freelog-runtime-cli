# 工具类详解

## 概述

项目中的工具类位于 `src/translate/tools/` 目录，负责状态机的各种操作。

```
src/translate/tools/
├── FSMTool.ts       # 状态机工具
├── ContractTool.ts  # 合约工具
├── EventTool.ts     # 事件工具
├── StateTool.ts     # 状态工具
├── AudienceTool.ts  # 受众工具
└── ServiceStateTool.ts  # 服务状态工具
```

## FSMTool（状态机工具）

最核心的工具类，处理状态机相关操作。

### 主要方法

```typescript
class FSMTool {
    // 生成状态机报告
    static report(fsmEntities: FSMEntity[]): FSMInfo[];
    
    // 处理状态转换
    static transfer(fsmEntities: FSMEntity[], fsmTransfers: FsmTransfer[]): any;
    
    // 解析状态机路由
    static parseRoutes(states, stateName: string, routes: FSMRouteElement[][], route: FSMRouteElement[]): void;
    
    // 比较两个状态机的路由
    static compareRoutes(routes: FSMRouteElement[][], routesB: FSMRouteElement[][]): void;
    
    // 清理路由
    static cleanUpRoutes(routes: FSMRouteElement[][]): FSMRouteElement[][];
    
    // 生成事件哈希码
    static generateEventHashCode(event: any): string;
}
```

### report 方法

生成状态机的可读报告：

```typescript
static report(fsmEntities: FSMEntity[]): FSMInfo[] {
    let results = [];

    for (let fsmEntity of fsmEntities) {
        // 如果没有事件，添加终止事件
        if (fsmEntity.events == null || fsmEntity.events.length == 0) {
            fsmEntity.events = [{name: TerminateEventTranslateStrategy.EVENT_NAME}];
        }
        
        let result = {
            stateInfo: StateTool.report(fsmEntity.name),
            serviceStateInfos: ServiceStateTool.report(fsmEntity.serviceStates),
            eventTranslateInfos: EventTool.report(fsmEntity.events, fsmEntity.serviceStates)
        };

        results.push(result);
    }

    return results;
}
```

### transfer 方法

处理状态转换记录，生成转换历史：

```typescript
static transfer(fsmEntities: FSMEntity[], fsmTransfers: FsmTransfer[]): any {
    // 构建状态映射
    let fsmEntityMap = {};
    fsmEntities.forEach(fsmEntity => {
        fsmEntityMap[fsmEntity.name] = fsmEntity;
    });

    // 处理每个转换记录
    for (let fsmTransfer of fsmTransfers) {
        let fsmEntity = fsmEntityMap[fsmTransfer.state];
        
        // 翻译状态
        let stateStr = translateState(fsmEntity);
        
        // 翻译事件
        let eventStr = translateEvent(fsmTransfer.event);
        
        // 生成结果
        results.push({
            state: stateStr,
            event: eventStr,
            // ...
        });
    }
}
```

### parseRoutes 方法

解析状态机的所有可能路径：

```typescript
static parseRoutes(states, stateName: string, routes: FSMRouteElement[][], route: FSMRouteElement[]): void {
    let state = states[stateName];
    
    // 终止状态
    if (state.transitions.length === 0) {
        routes.push([...route]);
        return;
    }
    
    // 遍历所有转换
    for (let transition of state.transitions) {
        route.push({
            state: stateName,
            event: transition.name,
            toState: transition.toState
        });
        
        // 递归解析
        this.parseRoutes(states, transition.toState, routes, route);
        
        route.pop();
    }
}
```

## ContractTool（合约工具）

生成合约报告。

```typescript
class ContractTool {
    static report(contract: ContractEntity): ContractInfo {
        let contractInfo = {
            audienceInfos: AudienceTool.report(contract.audiences),
            fsmInfos: FSMTool.report(contract.fsmStates),
            content: ""
        };
        
        // 生成受众描述
        let audienceStr = contractInfo.audienceInfos.map(e => e.content).join("，");
        
        // 生成状态机描述
        let fsmStrArray = [];
        for (let fsmInfo of contractInfo.fsmInfos) {
            let stateStr = fsmInfo.stateInfo.content;
            let serviceStateStr = fsmInfo.serviceStateInfos.map(e => e.content).join("，");
            
            let fsmStr = `${stateStr}[${serviceStateStr}]：\n`;
            for (let eventInfo of fsmInfo.eventTranslateInfos) {
                fsmStr += `  ${eventInfo.content}\n`;
            }
            fsmStrArray.push(fsmStr);
        }
        
        contractInfo.content = `${audienceStr}\n\n${fsmStrArray.join("")}`;
        return contractInfo;
    }
}
```

## EventTool（事件工具）

处理事件翻译。

```typescript
class EventTool {
    // 生成事件报告
    static report(events: EventEntity[], serviceStates?: string[]): EventTranslateInfo[] {
        let eventTranslateStrategyFactory = new EventTranslateStrategyFactory();
        let results = [];
        
        for (let event of events) {
            let strategy = eventTranslateStrategyFactory.getEventTranslateStrategy(event.name);
            let info = strategy.translate4Strategy(event, serviceStates);
            results.push(info);
        }
        
        return results;
    }
    
    // 翻译事件参数
    static translateEventArg(eventName: string, argName: string, argValue: string): string {
        // 根据事件类型翻译参数
        switch (eventName) {
            case 'TransactionEvent':
                if (argName === 'amount') return `${argValue} 元`;
                break;
            case 'RelativeTimeEvent':
                if (argName === 'timeUnit') return translateTimeUnit(argValue);
                break;
        }
        return argValue;
    }
}
```

## StateTool（状态工具）

处理状态名称翻译。

```typescript
class StateTool {
    // 翻译状态名
    static getName4State(stateName: string): string {
        const stateNameMap = {
            'initial': '初始状态',
            'auth': '授权状态',
            'finish': '终止状态',
            // ...
        };
        return stateNameMap[stateName] || stateName;
    }
    
    // 生成状态报告
    static report(stateName: string): StateInfo {
        return {
            origin: stateName,
            content: this.getName4State(stateName)
        };
    }
}
```

## AudienceTool（受众工具）

处理受众翻译。

```typescript
class AudienceTool {
    static report(audiences: AudienceEntity[]): AudienceInfo[] {
        return audiences.map(audience => {
            let content = '';
            switch (audience.type) {
                case 'public':
                    content = '所有人';
                    break;
                case 'userId':
                    content = `用户 ${audience.name}`;
                    break;
                case 'email':
                    content = `邮箱 ${audience.name}`;
                    break;
            }
            return { origin: audience, content };
        });
    }
}
```

## ServiceStateTool（服务状态工具）

处理服务状态翻译。

```typescript
class ServiceStateTool {
    static report(serviceStates: string[]): ServiceStateInfo[] {
        if (!serviceStates) return [];
        
        return serviceStates.map(state => {
            let content = '';
            switch (state) {
                case 'active':
                    content = '授权';
                    break;
                case 'testActive':
                    content = '测试授权';
                    break;
            }
            return { origin: state, content };
        });
    }
}
```

## 事件翻译策略

使用策略模式处理不同事件的翻译。

```typescript
// 策略接口
interface EventTranslateStrategy {
    getEventName(): string;
    translate4Strategy(event: EventEntity, serviceStates?: string[]): EventTranslateInfo;
    translate4UnFinish(event: EventEntity): EventTranslateInfo;
    translate4Finished(event: EventEntity): EventTranslateInfo;
}

// 具体策略
class TransactionEventTranslateStrategy implements EventTranslateStrategy {
    static EVENT_NAME = 'TransactionEvent';
    
    translate4Strategy(event: EventEntity): EventTranslateInfo {
        return {
            origin: event,
            content: `支付 ${event.args.amount} 元，进入 ${event.toState}`
        };
    }
}

class RelativeTimeEventTranslateStrategy implements EventTranslateStrategy {
    static EVENT_NAME = 'RelativeTimeEvent';
    
    translate4Strategy(event: EventEntity): EventTranslateInfo {
        return {
            origin: event,
            content: `${event.args.elapsed} ${translateTimeUnit(event.args.timeUnit)}后，进入 ${event.toState}`
        };
    }
}

// 策略工厂
class EventTranslateStrategyFactory {
    eventTranslateStrategyMap = new Map<string, EventTranslateStrategy>();

    constructor() {
        this.eventTranslateStrategyMap.set('TransactionEvent', new TransactionEventTranslateStrategy());
        this.eventTranslateStrategyMap.set('RelativeTimeEvent', new RelativeTimeEventTranslateStrategy());
        // ...
    }

    getEventTranslateStrategy(eventName: string): EventTranslateStrategy {
        return this.eventTranslateStrategyMap.get(eventName);
    }
}
```

## 使用示例

### 生成合约报告

```javascript
const policy_lang = require('@freelog/resource-policy-lang');

// 编译策略
const result = await policy_lang.compile(policyText, 'resource', url, 'dev');

// 生成报告
const report = policy_lang.report(result.state_machine);
console.log(report.content);

// 输出:
// 所有人
//
// 初始状态[授权]：
//   1 周后，进入 get_auth
// get_auth：
//   支付 29.99 元，进入 auth
// auth[授权]：
//   1 个月后，进入 finish
// finish：
//   终止
```

### 处理状态转换

```javascript
const transfers = [
    { toState: 'initial', time: '2024-01-01' },
    { toState: 'get_auth', time: '2024-01-08', event: { name: 'RelativeTimeEvent' } },
    { toState: 'auth', time: '2024-01-08', event: { name: 'TransactionEvent' } }
];

const result = policy_lang.transfer(states, transfers);
```

## 下一步

- [事件系统](./06-events.md) - 了解事件的定义和处理
- [API 参考](./07-api-reference.md) - 完整的 API 文档
