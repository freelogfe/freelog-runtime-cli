# 编译流程

## 概述

策略语言的编译流程遵循经典的编译器架构：

```
策略文本 → 词法分析 → 语法分析 → 语义分析 → 状态机 JSON
```

## 详细流程

### 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        编译流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                              │
│   │  策略文本    │  "for public\ninitial[active]:..."          │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │  InputStream │  antlr4.InputStream(policyText)             │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │   Lexer     │  LexToken.LexToken(chars)                    │
│   │  (词法分析)  │  → Token 流                                  │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │TokenStream  │  antlr4.CommonTokenStream(lexer)             │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │   Parser    │  resourcePolicy.resourcePolicy(stream)       │
│   │  (语法分析)  │  → AST                                       │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │   Visitor   │  UserPolicyCustomVisitor                     │
│   │  (语义分析)  │  → 状态机对象                                 │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │  Verify     │  visitor.verify()                            │
│   │  (验证)     │  → 错误检查                                   │
│   └──────┬──────┘                                              │
│          │                                                      │
│          v                                                      │
│   ┌─────────────┐                                              │
│   │ 状态机 JSON  │  { state_machine: {...}, errors: [] }       │
│   └─────────────┘                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 代码实现

### compile 函数

```javascript
// index.js
exports.compile = async function (policyText, targetType, targetUrl, env) {
    // 1. 创建字符流
    let chars = new antlr4.InputStream(policyText);

    // 2. 创建词法分析器
    let lexer = new LexToken.LexToken(chars);
    lexer.removeErrorListeners();
    let lexerErrorListener = new UserPolicyErrorLexerListener();
    lexer.addErrorListener(lexerErrorListener);

    // 3. 创建 Token 流
    let stream = new antlr4.CommonTokenStream(lexer);

    // 4. 创建语法分析器
    let parser = new resourcePolicy.resourcePolicy(stream);
    parser.removeErrorListeners();
    let errorListener = new UserPolicyErrorListener();
    parser.addErrorListener(errorListener);

    // 5. 解析并获取 AST
    let tree = parser.policy();

    // 6. 检查词法错误
    if (lexerErrorListener.errors.length !== 0) {
        return {
            errors: lexerErrorListener.errors,
            errorObjects: lexerErrorListener.errorObjects
        };
    }

    // 7. 创建 Visitor 并遍历 AST
    let visitor = new UserPolicyCustomVisitor(targetType, targetUrl, env);
    visitor.visit(tree);

    // 8. 验证
    await visitor.verify();

    // 9. 返回结果
    return {
        state_machine: visitor.state_machine,
        warnings: visitor.warningObjects.map(wo => wo.msg),
        warningObjects: visitor.warningObjects,
        errors: [...errorListener.errors, ...visitor.errorObjects.map(eo => eo.msg)],
        errorObjects: [...errorListener.errorObjects, ...visitor.errorObjects]
    };
}
```

## 各阶段详解

### 1. 词法分析（Lexing）

**输入**：策略文本字符串
**输出**：Token 流

**示例**：
```
输入: "for public\ninitial[active]:\n    ~freelog.Event() => state2"

Token 流:
[FOR, PUBLIC, NEWLINE, ID(initial), LBRACK, ID(active), RBRACK, COLON, 
 NEWLINE, TILDE, ID(freelog), DOT, ID(Event), LPAREN, RPAREN, ARROW, ID(state2)]
```

**相关文件**：`gen/LexToken.js`

### 2. 语法分析（Parsing）

**输入**：Token 流
**输出**：抽象语法树（AST）

**示例**：
```
AST:
policy
├── audience_section
│   └── audience: "public"
└── state_section
    └── state_definition
        ├── state_name: "initial"
        ├── service_states: ["active"]
        └── transition
            ├── event
            │   ├── service: "freelog"
            │   ├── event_name: "Event"
            │   └── event_args: []
            └── target_state: "state2"
```

**相关文件**：`gen/resourcePolicy.js`

### 3. 语义分析（Semantic Analysis）

**输入**：AST
**输出**：状态机对象

**处理内容**：
- 构建状态机数据结构
- 验证状态引用
- 验证事件参数
- 收集环境变量

**相关文件**：`UserPolicyCustomVisitor.js`

### 4. 验证（Verification）

**检查项**：
- 初始状态是否存在
- 目标状态是否定义
- 事件参数是否合法
- 服务状态是否有效

## Visitor 实现

### 核心方法

```javascript
class UserPolicyCustomVisitor extends resourcePolicyVisitor {
    constructor(subjectType, targetUrl, env) {
        super();
        this.state_machine = {};
        // 初始化...
    }

    // 访问策略根节点
    visitPolicy(ctx) {
        this.state_machine['audiences'] = [];
        this.state_machine['declarations'] = {};
        this.state_machine['states'] = {};
        return super.visitPolicy(ctx);
    }

    // 访问受众
    visitAudience(ctx) {
        let audience = ctx.getChild(0);
        let name = audience.getText();
        let type = this.getAudienceType(audience);
        this.state_machine["audiences"].push({ name, type });
        return super.visitAudience(ctx);
    }

    // 访问状态定义
    visitState_definition(ctx) {
        let stateName = ctx.state_name().getText();
        this.current_state = stateName;
        
        this.state_machine["states"][stateName] = {
            transitions: [],
            serviceStates: []
        };
        
        return super.visitState_definition(ctx);
    }

    // 访问状态转换
    visitState_transition(ctx) {
        let event = this.parseEvent(ctx.event());
        let toState = ctx.state_name().getText();
        
        this.state_machine["states"][this.current_state].transitions.push({
            ...event,
            toState
        });
        
        return super.visitState_transition(ctx);
    }
}
```

## 错误处理

### 词法错误

```javascript
class UserPolicyErrorLexerListener {
    constructor() {
        this.errors = [];
        this.errorObjects = [];
    }

    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        this.errors.push(`词法错误: 第${line}行第${column}列 - ${msg}`);
        this.errorObjects.push({ line, column, msg, type: 'lexer' });
    }
}
```

### 语法错误

```javascript
class UserPolicyErrorListener {
    constructor() {
        this.errors = [];
        this.errorObjects = [];
    }

    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        this.errors.push(`语法错误: 第${line}行第${column}列 - ${msg}`);
        this.errorObjects.push({ line, column, msg, type: 'parser' });
    }
}
```

### 语义错误

```javascript
// 在 Visitor 中收集语义错误
this.errorObjects.push({
    line: ctx.start.line,
    column: ctx.start.column,
    msg: `未定义的状态: ${stateName}`,
    type: 'semantic'
});
```

## 其他功能

### 反编译（Decompile）

将状态机 JSON 还原为策略文本：

```javascript
exports.decompile = function(stateMachine) {
    return new UserPolicyDecompiler().decompile(stateMachine);
}
```

### 格式化（Reformat）

格式化策略文本：

```javascript
exports.reformat = async function (policyText) {
    // 解析
    let tree = parser.policy();
    
    // 使用格式化 Visitor
    let reformatVisitor = new UserPolicyReformatVisitor();
    reformatVisitor.visit(tree);
    
    return {
        policyText: reformatVisitor.sb,
        positions: reformatVisitor.positions
    };
}
```

## 下一步

- [工具类详解](./05-tools.md) - 了解各个工具类的功能
- [事件系统](./06-events.md) - 了解事件的定义和处理
