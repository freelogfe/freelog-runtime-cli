# DSL 设计指南

## 什么是 DSL？

领域特定语言（Domain-Specific Language）是为特定问题领域设计的编程语言或规范语言。

### DSL 的类型

1. **内部 DSL**：嵌入在宿主语言中（如 Ruby 的 DSL）
2. **外部 DSL**：独立的语言，需要解析器（ANTLR4 用于创建外部 DSL）

### DSL 的优势

- 提高领域专家的生产力
- 代码更易读、易维护
- 减少错误
- 便于验证和测试

## DSL 设计原则

### 1. 简洁性

```antlr
// ❌ 过于冗长
CREATE_RULE rule_name WITH condition_a AND condition_b THEN action_a;

// ✅ 简洁明了
rule rule_name: condition_a, condition_b -> action_a;
```

### 2. 一致性

```antlr
// ✅ 一致的语法风格
state initial [active]:
    ~event1 => state2
    ~event2 => state3

state state2:
    ~event3 => state3
```

### 3. 可读性

```antlr
// ✅ 接近自然语言
for public, premium_users

initial:
    on SigningEvent => signed

signed [active]:
    on PaymentEvent("10") => paid
    after 30 days => expired
```

### 4. 错误友好

提供清晰的错误信息和修复建议。

## DSL 设计流程

### 步骤 1：收集需求

- 与领域专家交流
- 收集用例和示例
- 理解核心概念

### 步骤 2：设计语法

```antlr
// 从简单开始
grammar SimplePolicy;

policy : audience_section state_section ;

audience_section : 'for' audience (',' audience)* ;
audience : 'public' | ID ;

state_section : state_definition+ ;
state_definition : state_name ':' transition* ;
```

### 步骤 3：迭代改进

根据反馈不断改进语法设计。

### 步骤 4：实现解析器

使用 ANTLR4 生成解析器，实现 Visitor。

### 步骤 5：测试和验证

编写测试用例，验证语法正确性。

## 实际案例：策略语言设计

### 需求分析

- 定义资源访问策略
- 支持状态机
- 支持事件驱动
- 支持条件表达式

### 语法设计

```antlr
grammar Policy;

// 策略
policy : audience_section? declaration_section? state_section ;

// 受众
audience_section : 'for' audience (',' audience)* ;
audience : 'public' | ID | EMAIL ;

// 声明
declaration_section : declaration+ ;
declaration : 'always' ID                    // 全局状态
            | ID '(' params ')' '=' expr     // 表达式定义
            ;

// 状态机
state_section : state_definition+ ;
state_definition : state_name service_states? ':' transition* ;
state_name : ID | 'initial' ;
service_states : '[' ID (',' ID)* ']' ;

// 转换
transition : event '=>' state_name
           | 'terminate'
           ;

// 事件
event : '~' service '.' event_name '(' args? ')' ;
service : ID ('.' ID)* ;
event_name : ID ;
args : arg (',' arg)* ;
arg : STRING | NUMBER | ID ;
```

### 示例代码

```
for public, premium_users

always active

initial [active]:
    ~freelog.SigningEvent("resource1") => signed

signed:
    ~freelog.TransactionEvent("29.99", "self.account") => paid

paid [active]:
    ~freelog.RelativeTimeEvent("1", "month") => expired

expired:
    terminate
```

## 语法糖设计

### 1. 简化常见模式

```antlr
// 原始写法
state [active]:
    ~freelog.TransactionEvent("10", "self.account") => next

// 语法糖
state [active]:
    pay 10 => next
```

### 2. 默认值

```antlr
// 省略默认值
state:
    after 30 days => next

// 等价于
state:
    ~freelog.RelativeTimeEvent("30", "day") => next
```

### 3. 别名

```antlr
// 定义别名
alias pay = ~freelog.TransactionEvent
alias wait = ~freelog.RelativeTimeEvent

// 使用别名
state:
    pay("10") => next
    wait("30", "day") => expired
```

## 错误处理设计

### 1. 语法错误

```typescript
class PolicyErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        const suggestions = this.getSuggestions(msg);
        console.error(`错误: 第${line}行第${column}列`);
        console.error(`  ${msg}`);
        if (suggestions.length > 0) {
            console.error(`  建议: ${suggestions.join(', ')}`);
        }
    }
}
```

### 2. 语义错误

```typescript
class SemanticChecker extends PolicyVisitor<void> {
    private states: Set<string> = new Set();
    private errors: string[] = [];
    
    visitState_definition(ctx: State_definitionContext): void {
        const stateName = ctx.state_name().getText();
        if (this.states.has(stateName)) {
            this.errors.push(`重复的状态定义: ${stateName}`);
        }
        this.states.add(stateName);
    }
    
    visitTransition(ctx: TransitionContext): void {
        const targetState = ctx.state_name()?.getText();
        if (targetState && !this.states.has(targetState)) {
            this.errors.push(`未定义的目标状态: ${targetState}`);
        }
    }
}
```

## 文档生成

### 自动生成语法文档

```typescript
class DocGenerator extends PolicyVisitor<string> {
    visitPolicy(ctx: PolicyContext): string {
        let doc = '# 策略语法文档\n\n';
        doc += '## 受众\n\n';
        doc += this.visit(ctx.audience_section());
        doc += '\n## 状态机\n\n';
        doc += this.visit(ctx.state_section());
        return doc;
    }
}
```

## 最佳实践

1. **从用户角度设计**：让领域专家能够理解和使用
2. **保持简单**：只包含必要的特性
3. **提供好的错误信息**：帮助用户快速定位和修复问题
4. **编写文档**：提供清晰的语法说明和示例
5. **版本控制**：语法变更要向后兼容
