# 策略语言案例

参考当前项目的策略语言实现，创建一个简化版的策略语言解析器。

## 功能特性

- ✅ 受众定义（audience）
- ✅ 状态机定义
- ✅ 事件转换
- ✅ 服务状态（service states）
- ✅ 表达式定义

## 项目结构

```
policy-language/
├── README.md
├── package.json
├── tsconfig.json
├── Policy.g4           # 策略语法文件
├── src/
│   ├── main.ts          # 主程序
│   ├── PolicyVisitor.ts # 策略 Visitor
│   └── types.ts         # 类型定义
└── test/
    └── test.ts          # 测试用例
```

## 快速开始

```bash
npm install
npm run generate
npm run build
npm start
```

## 使用示例

```typescript
import { parsePolicy } from './src/main';

const policy = `
for public, user123

initial[active]:
    ~freelog.SigningEvent("resource1") => signed

signed[active]:
    ~freelog.TransactionEvent("10", "self.account") => auth

auth:
    terminate
`;

const result = parsePolicy(policy);
console.log(result);
```

## 学习重点

1. **状态机建模**：学习如何将策略文本转换为状态机
2. **事件驱动解析**：理解事件驱动的状态转换
3. **领域特定语言设计**：学习如何设计 DSL
4. **复杂结构解析**：学习解析嵌套的规则结构
