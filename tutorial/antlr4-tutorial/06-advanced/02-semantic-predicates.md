# 语义谓词

## 什么是语义谓词？

语义谓词（Semantic Predicates）允许你在语法规则中添加运行时条件，用于处理上下文相关的语法。

## 基本用法

```antlr
// 使用语义谓词
expression : {isVariable()}? ID
           | NUMBER
           ;
```

## 实际案例

### 案例 1：上下文相关的关键字

```antlr
grammar Contextual;

// 在某些上下文中，ID 可能是关键字
statement : declaration | assignment ;

declaration : {isType()}? ID ID ';' ;  // type name;
assignment : ID '=' expression ';' ;   // name = value;
```

### 案例 2：动态规则选择

```antlr
expression : {isFunction()}? function_call
           | {isVariable()}? ID
           | NUMBER
           ;
```

## 注意事项

语义谓词会增加语法复杂性，应该谨慎使用。大多数情况下，可以通过重新设计语法规则来避免使用语义谓词。
