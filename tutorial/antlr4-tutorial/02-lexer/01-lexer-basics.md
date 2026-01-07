# 词法分析基础

## 什么是词法分析？

词法分析（Lexical Analysis）是将输入的字符流转换为 Token 流的过程。词法分析器（Lexer）负责识别语言中的基本单元，如关键字、标识符、数字、运算符等。

## Token 的概念

Token 是词法分析的最小单位，包含：
- **类型（Type）**：Token 的种类
- **文本（Text）**：匹配到的实际文本
- **位置信息**：行号、列号

## 词法规则语法

### 基本规则

```antlr
grammar Example;

// 词法规则：大写字母开头
IDENTIFIER : [a-zA-Z][a-zA-Z0-9]* ;  // 标识符
NUMBER     : [0-9]+ ;                  // 数字
PLUS       : '+' ;                     // 加号
WS         : [ \t\r\n]+ -> skip ;      // 跳过空白字符
```

### 字符类

```antlr
// 单个字符
A : 'a' ;

// 字符范围
DIGIT : [0-9] ;           // 0-9
LETTER : [a-zA-Z] ;        // a-z, A-Z
ALPHANUM : [a-zA-Z0-9] ;   // 字母和数字

// 排除字符
NOT_NEWLINE : ~[\r\n] ;    // 除了换行符外的所有字符
```

### 量词

```antlr
// + : 一个或多个
ID : [a-z]+ ;              // 至少一个字母

// * : 零个或多个
OPTIONAL : [a-z]* ;        // 零个或多个字母

// ? : 零个或一个
OPTIONAL_DIGIT : [0-9]? ;  // 可选的数字

// {n} : 恰好 n 个
EXACTLY_3 : [0-9]{3} ;     // 恰好3个数字

// {n,m} : n 到 m 个
BETWEEN_2_4 : [0-9]{2,4} ; // 2到4个数字
```

### 组合和选择

```antlr
// 序列
HELLO : 'hello' 'world' ;  // 匹配 "helloworld"

// 选择（或）
OPERATOR : '+' | '-' | '*' | '/' ;  // 匹配任意运算符

// 分组
COMPLEX : ('a' | 'b') ('c' | 'd') ; // ac, ad, bc, bd
```

### 片段规则（Fragment）

片段规则不会生成 Token，只用于组织复杂的词法规则：

```antlr
// 定义片段
fragment DIGIT : [0-9] ;
fragment LETTER : [a-zA-Z] ;

// 使用片段
NUMBER : DIGIT+ ;                    // 一个或多个数字
IDENTIFIER : LETTER (LETTER | DIGIT)* ; // 字母开头，后跟字母或数字
```

## 词法规则优先级

ANTLR4 使用**最长匹配**原则：

```antlr
grammar Priority;

// 规则1：匹配 "if"
IF : 'if' ;

// 规则2：匹配标识符
ID : [a-z]+ ;

// 输入 "if"
// 匹配结果：IF Token（因为完全匹配）

// 输入 "ifx"
// 匹配结果：ID Token（因为 "if" 不是完整匹配）
```

**规则顺序也很重要**：如果多个规则都能匹配，选择**第一个**匹配的规则。

## 词法动作（Lexer Actions）

### skip - 跳过 Token

```antlr
WS : [ \t\r\n]+ -> skip ;  // 跳过空白字符
COMMENT : '//' ~[\r\n]* -> skip ;  // 跳过单行注释
```

### channel - 发送到特定通道

```antlr
WS : [ \t\r\n]+ -> channel(HIDDEN) ;  // 发送到隐藏通道
COMMENT : '/*' .*? '*/' -> channel(HIDDEN) ;  // 注释也发送到隐藏通道
```

### mode - 词法模式

用于处理嵌套结构（如字符串中的转义字符）：

```antlr
STRING : '"' -> pushMode(STRING_MODE) ;

mode STRING_MODE;
    STRING_CONTENT : ~["\\]+ ;           // 字符串内容
    ESCAPE : '\\' . -> skip ;            // 转义字符
    STRING_END : '"' -> popMode ;         // 字符串结束
```

## 常见模式

### 1. 标识符

```antlr
// 简单标识符
ID : [a-zA-Z_][a-zA-Z0-9_]* ;

// 带关键字检查（关键字需要先定义）
ID : [a-zA-Z_][a-zA-Z0-9_]* 
    {
        // 在生成的代码中检查是否为关键字
        if (isKeyword(getText())) {
            setType(KEYWORD);
        }
    }
    ;
```

### 2. 数字

```antlr
// 整数
INT : [0-9]+ ;

// 小数
FLOAT : [0-9]+ '.' [0-9]+ 
      | '.' [0-9]+ 
      | [0-9]+ '.' 
      ;

// 科学计数法
SCIENTIFIC : [0-9]+ '.' [0-9]+ [eE] [+-]? [0-9]+ 
           | [0-9]+ [eE] [+-]? [0-9]+ 
           ;
```

### 3. 字符串

```antlr
// 简单字符串（不支持转义）
STRING : '"' ~["]* '"' ;

// 支持转义字符的字符串
STRING : '"' (ESC | ~["\\])* '"' ;
fragment ESC : '\\' (["\\/bfnrt] | UNICODE) ;
fragment UNICODE : 'u' HEX HEX HEX HEX ;
fragment HEX : [0-9a-fA-F] ;
```

### 4. 注释

```antlr
// 单行注释
LINE_COMMENT : '//' ~[\r\n]* -> skip ;

// 多行注释
BLOCK_COMMENT : '/*' .*? '*/' -> skip ;

// 注意：.*? 是非贪婪匹配
```

## 实战示例

### 示例 1：简单计算器词法规则

```antlr
grammar CalcLexer;

// 数字
NUMBER : [0-9]+ ('.' [0-9]+)? ;

// 运算符
PLUS  : '+' ;
MINUS : '-' ;
MULT  : '*' ;
DIV   : '/' ;
LPAREN : '(' ;
RPAREN : ')' ;

// 空白字符
WS : [ \t\r\n]+ -> skip ;
```

### 示例 2：JSON 词法规则

```antlr
grammar JsonLexer;

// 结构字符
LCURLY : '{' ;
RCURLY : '}' ;
LBRACK : '[' ;
RBRACK : ']' ;
COMMA  : ',' ;
COLON  : ':' ;

// 关键字
TRUE  : 'true' ;
FALSE : 'false' ;
NULL  : 'null' ;

// 字符串
STRING : '"' (ESC | ~["\\])* '"' ;
fragment ESC : '\\' (["\\/bfnrt] | UNICODE) ;
fragment UNICODE : 'u' HEX HEX HEX HEX ;
fragment HEX : [0-9a-fA-F] ;

// 数字
NUMBER : '-'? INT ('.' [0-9]+)? EXP? ;
fragment INT : '0' | [1-9] [0-9]* ;
fragment EXP : [eE] [+-]? INT ;

// 空白字符
WS : [ \t\r\n]+ -> skip ;
```

## 调试技巧

### 1. 查看生成的 Token

```typescript
const lexer = new MyLexer(chars);
const tokens = new CommonTokenStream(lexer);
tokens.fill();

for (let i = 0; i < tokens.size(); i++) {
    const token = tokens.get(i);
    console.log(`Token ${i}: ${lexer.symbolicNames[token.type]} = "${token.text}"`);
}
```

### 2. 可视化 Token 流

使用 ANTLR4 的调试工具或编写简单的可视化代码。

## 常见错误

### 错误 1：规则顺序错误

```antlr
// ❌ 错误：ID 会匹配 "if"
ID : [a-z]+ ;
IF : 'if' ;

// ✅ 正确：关键字在前
IF : 'if' ;
ID : [a-z]+ ;
```

### 错误 2：忘记跳过空白字符

```antlr
// ❌ 错误：空白字符会生成 Token
WS : [ \t\r\n]+ ;

// ✅ 正确：跳过空白字符
WS : [ \t\r\n]+ -> skip ;
```

### 错误 3：贪婪匹配问题

```antlr
// ❌ 错误：会匹配整个文件
COMMENT : '/*' .* '*/' ;

// ✅ 正确：非贪婪匹配
COMMENT : '/*' .*? '*/' ;
```

## 下一步

- [Token 详解](./02-tokens.md) - 深入了解 Token
- [词法规则编写](./03-lexer-rules.md) - 高级词法规则
- [语法分析教程](../03-parser/01-parser-basics.md) - 学习语法分析
