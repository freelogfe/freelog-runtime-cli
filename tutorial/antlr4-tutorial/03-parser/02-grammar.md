# 语法文件编写

## 语法文件结构

```antlr
grammar MyGrammar;

// 选项
options {
    language = JavaScript;
    tokenVocab = OtherGrammar;  // 复用其他语法的 Token
}

// 导入（如果支持）
import OtherGrammar;

// 词法规则
TOKEN1 : 'pattern' ;
TOKEN2 : [a-z]+ ;

// 语法规则
rule1 : TOKEN1 TOKEN2 ;
rule2 : rule1+ ;

// 片段规则
fragment HELPER : 'a' | 'b' ;
```

## 选项配置

### language

指定目标语言：

```antlr
options {
    language = JavaScript;  // JavaScript
    language = TypeScript;  // TypeScript
    language = Java;        // Java
    language = Python3;     // Python
}
```

### tokenVocab

复用其他语法的 Token：

```antlr
// Lexer.g4
lexer grammar Lexer;
ID : [a-z]+ ;
NUMBER : [0-9]+ ;

// Parser.g4
parser grammar Parser;
options { tokenVocab = Lexer; }
expression : ID NUMBER ;
```

## 规则组织

### 1. 按功能分组

```antlr
// 表达式相关
expression : term (('+'|'-') term)* ;
term : factor (('*'|'/') factor)* ;

// 语句相关
statement : assignment | if_statement | return_statement ;
assignment : ID '=' expression ;
```

### 2. 使用注释

```antlr
// ========== 表达式 ==========
expression : term (('+'|'-') term)* ;

// ========== 语句 ==========
statement : assignment | if_statement ;
```

## 最佳实践

### 1. 规则命名

```antlr
// ✅ 好的命名：清晰、描述性
expression : term (('+'|'-') term)* ;
if_statement : 'if' '(' condition ')' statement ;

// ❌ 差的命名：模糊、缩写
expr : t (('+'|'-') t)* ;
if_stmt : 'if' '(' c ')' s ;
```

### 2. 避免过度嵌套

```antlr
// ❌ 过度嵌套
a : b (c (d (e f)*)*)* ;

// ✅ 分解为多个规则
a : b c_list* ;
c_list : c d_list* ;
d_list : d e_list* ;
e_list : e f* ;
```

### 3. 使用辅助规则

```antlr
// ✅ 使用辅助规则提高可读性
expression : term (add_op term)* ;
add_op : '+' | '-' ;

// ❌ 直接在规则中使用
expression : term (('+'|'-') term)* ;
```

## 常见模式

### 1. 可选元素

```antlr
// 可选分号
statement : expression ';'? ;

// 可选类型注解
variable : ID (':' type)? '=' expression ;
```

### 2. 列表

```antlr
// 非空列表
args : expression (',' expression)+ ;

// 可能为空的列表
optional_args : (expression (',' expression)*)? ;
```

### 3. 重复

```antlr
// 零个或多个
statements : statement* ;

// 一个或多个
args : expression+ ;
```

## 调试技巧

### 1. 打印语法树

```typescript
const tree = parser.program();
console.log(tree.toStringTree(parser.ruleNames));
```

### 2. 可视化语法树

使用 ANTLR4 的调试工具或编写可视化代码。

### 3. 测试单个规则

```typescript
// 只解析表达式
const tree = parser.expression();
```

## 常见错误

### 错误 1：间接左递归

```antlr
// ❌ 错误
a : b ;
b : a ;

// ✅ 正确：合并规则
a : b | TERMINAL ;
```

### 错误 2：优先级错误

```antlr
// ❌ 错误：同一优先级
expression : term (('+'|'-'|'*'|'/') term)* ;

// ✅ 正确：通过规则层次体现优先级
expression : term (('+'|'-') term)* ;
term : factor (('*'|'/') factor)* ;
```
