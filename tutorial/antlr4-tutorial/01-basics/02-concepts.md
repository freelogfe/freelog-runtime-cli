# ANTLR4 核心概念

## 什么是解析器生成器？

解析器生成器（Parser Generator）是一种工具，它根据你定义的语法规则，自动生成能够解析特定文本格式的代码。

### 传统方式 vs ANTLR4

**传统方式（手动编写）：**
```javascript
// 手动编写解析逻辑
function parseExpression(input) {
    let tokens = tokenize(input);
    let ast = buildAST(tokens);
    return ast;
}
// 需要处理大量边界情况，容易出错
```

**使用 ANTLR4：**
```antlr
// 定义语法规则
expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | '(' expression ')' ;
```
ANTLR4 自动生成解析器代码！

## 核心概念

### 1. 词法分析（Lexical Analysis / Lexing）

**定义：** 将输入的字符流转换为 Token 流的过程。

**示例：**
```
输入: "3 + 4 * 5"
      ↓
Token流: [NUMBER(3), PLUS(+), NUMBER(4), MULT(*), NUMBER(5)]
```

**在 ANTLR4 中：**
```antlr
grammar Calc;
NUMBER : [0-9]+ ;      // 词法规则：匹配数字
PLUS   : '+' ;          // 词法规则：匹配加号
MULT   : '*' ;          // 词法规则：匹配乘号
WS     : [ \t]+ -> skip ; // 跳过空白字符
```

### 2. 语法分析（Syntax Analysis / Parsing）

**定义：** 将 Token 流转换为抽象语法树（AST）的过程。

**示例：**
```
Token流: [NUMBER(3), PLUS(+), NUMBER(4), MULT(*), NUMBER(5)]
         ↓
AST:    PLUS
       /    \
    NUMBER  MULT
      3    /    \
         NUMBER NUMBER
           4      5
```

**在 ANTLR4 中：**
```antlr
expression : term (('+'|'-') term)* ;  // 语法规则
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | '(' expression ')' ;
```

### 3. Token（词法单元）

**定义：** 词法分析器识别出的最小语法单位。

**Token 的组成部分：**
- **类型（Type）**：如 NUMBER, IDENTIFIER, PLUS
- **文本（Text）**：实际的字符内容
- **位置信息**：行号、列号

**示例：**
```javascript
Token {
    type: NUMBER,
    text: "42",
    line: 1,
    column: 0
}
```

### 4. 语法规则（Grammar Rules）

**定义：** 描述语言结构的规则。

**规则类型：**

1. **词法规则（Lexer Rules）**：大写字母开头
   ```antlr
   IDENTIFIER : [a-zA-Z][a-zA-Z0-9]* ;
   NUMBER     : [0-9]+ ;
   ```

2. **语法规则（Parser Rules）**：小写字母开头
   ```antlr
   expression : term (('+'|'-') term)* ;
   statement  : expression ';' ;
   ```

### 5. 抽象语法树（AST）

**定义：** 源代码的树形表示，每个节点代表一个语法结构。

**特点：**
- 不包含语法细节（如括号、分号）
- 只保留语义结构
- 便于后续处理（代码生成、转换等）

**示例：**
```
表达式: 3 + 4 * 5

AST:
    +
   / \
  3   *
     / \
    4   5
```

### 6. Visitor 模式

**定义：** 一种遍历 AST 的设计模式，通过访问者对象处理每个节点。

**特点：**
- 显式控制遍历顺序
- 可以返回值
- 适合代码生成、转换

**示例：**
```javascript
class EvalVisitor extends CalcBaseVisitor {
    visitExpression(ctx) {
        // 访问表达式节点
        let left = this.visit(ctx.term(0));
        let right = this.visit(ctx.term(1));
        return left + right;
    }
}
```

### 7. Listener 模式

**定义：** 另一种遍历 AST 的方式，通过监听器响应节点事件。

**特点：**
- 隐式遍历（自动遍历）
- 无返回值
- 适合收集信息、副作用操作

**示例：**
```javascript
class PrintListener extends CalcBaseListener {
    enterExpression(ctx) {
        console.log("进入表达式");
    }
    
    exitExpression(ctx) {
        console.log("离开表达式");
    }
}
```

## ANTLR4 工作流程

```
1. 编写语法文件 (.g4)
   ↓
2. ANTLR4 生成代码
   - Lexer（词法分析器）
   - Parser（语法分析器）
   - Visitor/Listener（遍历器）
   ↓
3. 使用生成的代码
   - 输入文本 → Lexer → Token流
   - Token流 → Parser → AST
   - AST → Visitor/Listener → 处理结果
```

## 语法文件结构

```antlr
grammar MyGrammar;        // 语法名称

// 选项
options {
    language = JavaScript;
}

// 词法规则（大写开头）
TOKEN1 : 'pattern' ;
TOKEN2 : [a-z]+ ;

// 语法规则（小写开头）
rule1 : TOKEN1 TOKEN2 ;
rule2 : rule1+ ;

// 片段规则（不生成 Token）
fragment DIGIT : [0-9] ;
```

## 关键术语对照表

| 中文 | 英文 | 说明 |
|------|------|------|
| 词法分析 | Lexical Analysis | 字符流 → Token流 |
| 语法分析 | Syntax Analysis | Token流 → AST |
| 词法单元 | Token | 最小的语法单位 |
| 语法规则 | Grammar Rule | 描述语言结构的规则 |
| 抽象语法树 | AST | 源代码的树形表示 |
| 访问者 | Visitor | 遍历 AST 的模式 |
| 监听器 | Listener | 另一种遍历模式 |
| 词法规则 | Lexer Rule | 大写开头的规则 |
| 语法规则 | Parser Rule | 小写开头的规则 |

## 常见误解

### ❌ 误解1：ANTLR4 只能解析编程语言

**✅ 正确：** ANTLR4 可以解析任何结构化文本：
- 配置文件（JSON, XML, YAML）
- 查询语言（SQL, GraphQL）
- 数据格式（CSV, Log）
- 领域特定语言（DSL）

### ❌ 误解2：需要深入了解编译原理才能使用

**✅ 正确：** 基础概念即可开始，边学边用。

### ❌ 误解3：ANTLR4 生成的代码性能差

**✅ 正确：** 对于大多数应用场景，性能足够好。只有极端性能要求才需要手写解析器。

## 下一步

- [快速开始](./03-quick-start.md) - 编写第一个 ANTLR4 程序
- [词法分析教程](../02-lexer/01-lexer-basics.md) - 深入学习词法分析
