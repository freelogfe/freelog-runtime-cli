# 语法分析基础

## 什么是语法分析？

语法分析（Syntax Analysis / Parsing）是将 Token 流转换为抽象语法树（AST）的过程。语法分析器（Parser）根据语法规则，识别 Token 流中的语法结构。

## 语法规则语法

### 基本规则

```antlr
grammar Example;

// 语法规则：小写字母开头
expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | '(' expression ')' ;
```

### 规则元素

#### 1. 字面量（Literal）

```antlr
// 匹配特定的 Token
assignment : ID '=' expression ;
```

#### 2. 规则引用（Rule Reference）

```antlr
// 引用其他规则
expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
```

#### 3. 标签（Label）

```antlr
// 给规则元素添加标签，方便在代码中访问
expression : left=term (op=('+'|'-') right=term)* ;
// 在 Visitor 中：ctx.left, ctx.op, ctx.right
```

#### 4. 量词

```antlr
// + : 一个或多个
args : expression (',' expression)+ ;

// * : 零个或多个
optional_args : expression (',' expression)* ;

// ? : 零个或一个
optional_semicolon : ';'? ;
```

#### 5. 选择（Alternatives）

```antlr
// | : 或
statement : assignment | if_statement | return_statement ;

// 优先级：按顺序尝试匹配
expression : term '+' term | term '-' term | term '*' term ;
```

#### 6. 分组

```antlr
// 括号用于分组
expression : (term '+' term) | (term '-' term) ;
```

### 规则修饰符

```antlr
// public : 生成公共方法
public expression : term (('+'|'-') term)* ;

// private : 生成私有方法（辅助规则）
private term : factor (('*'|'/') factor)* ;

// fragment : 不生成规则（仅用于组织）
fragment helper : 'a' | 'b' ;
```

## 左递归处理

ANTLR4 **支持直接左递归**：

```antlr
// ✅ 正确：ANTLR4 支持
expression : expression '+' term | term ;

// ❌ 错误：ANTLR4 不支持间接左递归
a : b ;
b : a ;
```

**左递归转换：**

```antlr
// 直接左递归（ANTLR4 自动处理）
expression : expression '+' term | term ;

// 等价于（ANTLR4 内部转换）
expression : term ('+' term)* ;
```

## 优先级处理

优先级通过规则层次体现：

```antlr
// 优先级从低到高
expression : term (('+'|'-') term)* ;    // 最低优先级
term       : factor (('*'|'/') factor)* ; // 中等优先级
factor     : NUMBER | '(' expression ')' ; // 最高优先级
```

**优先级规则：**
- 越深的规则，优先级越高
- 同一层级的运算符，按顺序决定结合性

## 结合性

### 左结合（默认）

```antlr
// 左结合：a - b - c = (a - b) - c
expression : expression '-' term | term ;
```

### 右结合

```antlr
// 右结合：a = b = c = a = (b = (c = a))
assignment : ID '=' assignment | expression ;
```

## 常见模式

### 1. 列表

```antlr
// 非空列表
args : expression (',' expression)+ ;

// 可能为空的列表
optional_args : (expression (',' expression)*)? ;

// 尾随逗号
args_with_trailing : expression (',' expression)* ','? ;
```

### 2. 可选元素

```antlr
// 可选分号
statement : expression ';'? ;

// 可选类型注解
variable : ID (':' type)? '=' expression ;
```

### 3. 重复结构

```antlr
// 重复的语句
program : statement* ;

// 重复的类成员
class_body : (field | method)* ;
```

### 4. 条件语句

```antlr
// if-else
if_statement : 'if' '(' condition ')' statement ('else' statement)? ;

// switch-case
switch_statement : 'switch' '(' expression ')' '{' case* '}' ;
case : 'case' expression ':' statement* ;
```

## 实战示例

### 示例 1：简单表达式

```antlr
grammar SimpleExpr;

expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | '(' expression ')' ;

NUMBER : [0-9]+ ;
WS     : [ \t\r\n]+ -> skip ;
```

### 示例 2：赋值语句

```antlr
grammar Assignment;

program : statement* EOF ;

statement : assignment | expression ';' ;

assignment : ID '=' expression ';' ;

expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | ID | '(' expression ')' ;

ID     : [a-zA-Z][a-zA-Z0-9]* ;
NUMBER : [0-9]+ ;
WS     : [ \t\r\n]+ -> skip ;
```

### 示例 3：函数调用

```antlr
grammar FunctionCall;

expression : ID '(' args? ')' | NUMBER ;

args : expression (',' expression)* ;

ID     : [a-zA-Z][a-zA-Z0-9]* ;
NUMBER : [0-9]+ ;
WS     : [ \t\r\n]+ -> skip ;
```

## AST 结构

语法分析的结果是抽象语法树（AST），每个节点对应一个语法规则：

```
输入: 3 + 4 * 5

AST:
expression
├─ term (3)
├─ '+'
└─ term
   ├─ factor (4)
   ├─ '*'
   └─ factor (5)
```

## 调试技巧

### 1. 打印语法树

```typescript
const tree = parser.expression();
console.log(tree.toStringTree(parser.ruleNames));
```

### 2. 可视化语法树

使用 ANTLR4 的调试工具或编写可视化代码。

### 3. 检查规则匹配

```typescript
// 检查是否匹配成功
if (parser.getNumberOfSyntaxErrors() > 0) {
    console.error('语法错误');
}
```

## 常见错误

### 错误 1：间接左递归

```antlr
// ❌ 错误：间接左递归
a : b ;
b : a ;

// ✅ 正确：合并规则
a : b | TERMINAL ;
b : a | TERMINAL ;
```

### 错误 2：优先级错误

```antlr
// ❌ 错误：+ 和 * 同一优先级
expression : term (('+'|'-'|'*'|'/') term)* ;

// ✅ 正确：通过规则层次体现优先级
expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
```

### 错误 3：忘记 EOF

```antlr
// ❌ 错误：可能只解析部分输入
program : statement* ;

// ✅ 正确：确保解析完整输入
program : statement* EOF ;
```

## 下一步

- [语法文件编写](./02-grammar.md) - 深入学习语法文件
- [抽象语法树](./03-ast.md) - 理解 AST
- [Visitor 模式教程](../04-visitor/01-visitor-pattern.md) - 学习遍历 AST
