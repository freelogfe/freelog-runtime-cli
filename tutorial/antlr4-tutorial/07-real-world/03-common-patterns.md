# 常见语法模式

## 表达式语法模式

### 1. 算术表达式

```antlr
// 带优先级的算术表达式
expression : term (('+'|'-') term)* ;
term : factor (('*'|'/') factor)* ;
factor : power ('^' power)* ;
power : unary ;
unary : '-' unary | primary ;
primary : NUMBER | '(' expression ')' ;
```

### 2. 布尔表达式

```antlr
boolExpr : boolTerm ('||' boolTerm)* ;
boolTerm : boolFactor ('&&' boolFactor)* ;
boolFactor : '!' boolFactor | boolPrimary ;
boolPrimary : 'true' | 'false' | comparison | '(' boolExpr ')' ;
comparison : expression ('==' | '!=' | '<' | '>' | '<=' | '>=') expression ;
```

### 3. 三元表达式

```antlr
ternary : boolExpr '?' expression ':' expression ;
```

## 语句语法模式

### 1. 条件语句

```antlr
ifStatement : 'if' '(' expression ')' statement ('else' statement)? ;

// 避免悬空 else 问题
ifStatement : 'if' '(' expression ')' closedStatement 'else' statement
            | 'if' '(' expression ')' statement
            ;
closedStatement : 'if' '(' expression ')' closedStatement 'else' closedStatement
                | otherStatement
                ;
```

### 2. 循环语句

```antlr
// for 循环
forStatement : 'for' '(' init? ';' condition? ';' update? ')' statement ;
init : varDecl | expression ;
condition : expression ;
update : expression (',' expression)* ;

// while 循环
whileStatement : 'while' '(' expression ')' statement ;

// do-while 循环
doWhileStatement : 'do' statement 'while' '(' expression ')' ';' ;

// for-each 循环
forEachStatement : 'for' '(' type ID ':' expression ')' statement ;
```

### 3. switch 语句

```antlr
switchStatement : 'switch' '(' expression ')' '{' caseClause* defaultClause? '}' ;
caseClause : 'case' expression ':' statement* ;
defaultClause : 'default' ':' statement* ;
```

## 声明语法模式

### 1. 变量声明

```antlr
varDecl : type ID ('=' expression)? ';' ;
type : primitiveType | classType | arrayType ;
primitiveType : 'int' | 'float' | 'boolean' | 'string' ;
classType : ID ('.' ID)* ;
arrayType : type '[' ']' ;
```

### 2. 函数声明

```antlr
funcDecl : type ID '(' paramList? ')' block ;
paramList : param (',' param)* ;
param : type ID ;
block : '{' statement* '}' ;
```

### 3. 类声明

```antlr
classDecl : 'class' ID ('extends' ID)? ('implements' idList)? classBody ;
classBody : '{' classMember* '}' ;
classMember : fieldDecl | methodDecl | constructorDecl ;
fieldDecl : modifier* type ID ('=' expression)? ';' ;
methodDecl : modifier* type ID '(' paramList? ')' block ;
constructorDecl : modifier* ID '(' paramList? ')' block ;
modifier : 'public' | 'private' | 'protected' | 'static' | 'final' ;
```

## 列表和集合模式

### 1. 逗号分隔列表

```antlr
// 非空列表
idList : ID (',' ID)* ;

// 可能为空的列表
optionalIdList : (ID (',' ID)*)? ;

// 带尾随逗号
idListWithTrailing : ID (',' ID)* ','? ;
```

### 2. 数组字面量

```antlr
arrayLiteral : '[' (expression (',' expression)*)? ']' ;
```

### 3. 对象字面量

```antlr
objectLiteral : '{' (property (',' property)*)? '}' ;
property : ID ':' expression
         | STRING ':' expression
         | '[' expression ']' ':' expression  // 计算属性名
         ;
```

## 字符串和模板模式

### 1. 简单字符串

```antlr
STRING : '"' (~["\\] | ESC)* '"' ;
fragment ESC : '\\' ["\\/bfnrt] | '\\u' HEX HEX HEX HEX ;
fragment HEX : [0-9a-fA-F] ;
```

### 2. 模板字符串

```antlr
// 使用词法模式处理模板字符串
TEMPLATE_START : '`' -> pushMode(TEMPLATE_MODE) ;

mode TEMPLATE_MODE;
    TEMPLATE_CONTENT : ~[`$\\]+ ;
    TEMPLATE_ESCAPE : '\\' . ;
    TEMPLATE_EXPR_START : '${' -> pushMode(DEFAULT_MODE) ;
    TEMPLATE_END : '`' -> popMode ;
```

### 3. 原始字符串

```antlr
RAW_STRING : 'r"' ~["]* '"'
           | "r'" ~[']* "'"
           ;
```

## 注释模式

### 1. 单行注释

```antlr
LINE_COMMENT : '//' ~[\r\n]* -> skip ;
```

### 2. 多行注释

```antlr
BLOCK_COMMENT : '/*' .*? '*/' -> skip ;
```

### 3. 文档注释

```antlr
DOC_COMMENT : '/**' .*? '*/' -> channel(HIDDEN) ;  // 保留用于文档生成
```

### 4. 嵌套注释

```antlr
// 使用词法模式处理嵌套注释
COMMENT_START : '/*' -> pushMode(COMMENT_MODE), skip ;

mode COMMENT_MODE;
    NESTED_COMMENT : '/*' -> pushMode(COMMENT_MODE), skip ;
    COMMENT_END : '*/' -> popMode, skip ;
    COMMENT_CONTENT : . -> skip ;
```

## 导入和模块模式

### 1. 导入语句

```antlr
importStmt : 'import' importPath ('as' ID)? ';'
           | 'import' '{' importList '}' 'from' STRING ';'
           | 'import' '*' 'as' ID 'from' STRING ';'
           ;
importPath : ID ('.' ID)* ;
importList : importItem (',' importItem)* ;
importItem : ID ('as' ID)? ;
```

### 2. 导出语句

```antlr
exportStmt : 'export' declaration
           | 'export' '{' exportList '}' ';'
           | 'export' 'default' expression ';'
           ;
exportList : exportItem (',' exportItem)* ;
exportItem : ID ('as' ID)? ;
```

## 类型系统模式

### 1. 泛型类型

```antlr
genericType : ID '<' typeList '>' ;
typeList : type (',' type)* ;
```

### 2. 联合类型

```antlr
unionType : type ('|' type)+ ;
```

### 3. 函数类型

```antlr
funcType : '(' paramTypeList? ')' '=>' type ;
paramTypeList : paramType (',' paramType)* ;
paramType : ID ':' type | type ;
```

## 错误恢复模式

### 1. 同步点

```antlr
// 在语句级别同步
statement : assignment
          | ifStatement
          | whileStatement
          | ';'  // 空语句，用于错误恢复
          ;
```

### 2. 错误产生式

```antlr
// 捕获常见错误
expression : term (('+'|'-') term)*
           | term ('+'|'-')  // 捕获缺少操作数的错误
           ;
```

## 完整示例：简单编程语言

```antlr
grammar SimpleLang;

program : statement* EOF ;

statement : varDecl
          | funcDecl
          | ifStatement
          | whileStatement
          | returnStatement
          | expressionStatement
          | block
          ;

varDecl : 'var' ID (':' type)? ('=' expression)? ';' ;
funcDecl : 'func' ID '(' paramList? ')' (':' type)? block ;
ifStatement : 'if' '(' expression ')' statement ('else' statement)? ;
whileStatement : 'while' '(' expression ')' statement ;
returnStatement : 'return' expression? ';' ;
expressionStatement : expression ';' ;
block : '{' statement* '}' ;

paramList : param (',' param)* ;
param : ID ':' type ;

type : 'int' | 'float' | 'bool' | 'string' | ID ;

expression : assignment ;
assignment : ternary ('=' assignment)? ;
ternary : logicalOr ('?' expression ':' expression)? ;
logicalOr : logicalAnd ('||' logicalAnd)* ;
logicalAnd : equality ('&&' equality)* ;
equality : comparison (('==' | '!=') comparison)* ;
comparison : term (('<' | '>' | '<=' | '>=') term)* ;
term : factor (('+' | '-') factor)* ;
factor : unary (('*' | '/' | '%') unary)* ;
unary : ('!' | '-') unary | call ;
call : primary ('(' argList? ')' | '.' ID)* ;
primary : NUMBER | STRING | 'true' | 'false' | 'null' | ID | '(' expression ')' ;

argList : expression (',' expression)* ;

// 词法规则
ID : [a-zA-Z_][a-zA-Z0-9_]* ;
NUMBER : [0-9]+ ('.' [0-9]+)? ;
STRING : '"' (~["\\] | '\\' .)* '"' ;
WS : [ \t\r\n]+ -> skip ;
LINE_COMMENT : '//' ~[\r\n]* -> skip ;
BLOCK_COMMENT : '/*' .*? '*/' -> skip ;
```

这个示例包含了大部分常见的语法模式，可以作为设计自己语言的参考。
