# 高级词法规则编写

## 词法模式（Lexer Modes）

词法模式是处理嵌套结构的强大工具，如字符串、注释、XML 标签等。

### 基本用法

```antlr
lexer grammar MyLexer;

// 默认模式
ID : [a-z]+ ;
STRING_START : '"' -> pushMode(STRING_MODE) ;

// 字符串模式
mode STRING_MODE;
    STRING_CONTENT : ~["\\]+ ;           // 普通字符
    ESCAPE_CHAR : '\\' ["\\/bfnrt] ;      // 转义字符
    UNICODE : '\\u' HEX HEX HEX HEX ;     // Unicode 转义
    STRING_END : '"' -> popMode ;          // 结束字符串，返回默认模式

fragment HEX : [0-9a-fA-F] ;
```

### 嵌套模式

```antlr
lexer grammar NestedLexer;

// 处理嵌套注释 /* /* */ */
COMMENT_START : '/*' -> pushMode(COMMENT_MODE) ;

mode COMMENT_MODE;
    NESTED_COMMENT_START : '/*' -> pushMode(COMMENT_MODE) ;  // 嵌套
    COMMENT_END : '*/' -> popMode ;                           // 结束
    COMMENT_CONTENT : . ;                                     // 其他字符
```

### 模式栈操作

```antlr
// pushMode(MODE) - 压入新模式
// popMode - 弹出当前模式
// mode(MODE) - 直接切换模式（不使用栈）
// more - 继续当前 Token 的匹配
// skip - 跳过当前 Token
```

## 岛屿语法（Island Grammars）

处理混合语言，如 HTML 中的 JavaScript：

```antlr
lexer grammar HTMLLexer;

// HTML 模式（默认）
TAG_OPEN : '<' -> pushMode(TAG_MODE) ;
TEXT : ~[<]+ ;

mode TAG_MODE;
    TAG_NAME : [a-zA-Z]+ ;
    TAG_CLOSE : '>' -> popMode ;
    SCRIPT_OPEN : 'script' -> pushMode(SCRIPT_MODE) ;

mode SCRIPT_MODE;
    SCRIPT_CONTENT : ~[<]+ ;
    SCRIPT_END : '</script>' -> popMode, popMode ;
```

## 词法规则中的动作

### 类型更改

```antlr
ID : [a-zA-Z]+ 
    {
        // 检查是否为关键字
        String text = getText();
        if (keywords.contains(text)) {
            setType(KEYWORD);
        }
    }
    ;
```

### 自定义 Token 生成

```antlr
// 生成多个 Token
INDENT : {atStartOfLine()}? [ \t]+ 
    {
        int indent = calculateIndent(getText());
        emitIndentTokens(indent);
    }
    ;
```

## 特殊字符处理

### Unicode 支持

```antlr
// Unicode 字母
UNICODE_ID : [\p{L}][\p{L}\p{N}]* ;

// Unicode 分类
// \p{L} - 字母
// \p{N} - 数字
// \p{Z} - 空白
// \p{P} - 标点
// \p{S} - 符号
```

### 特殊字符转义

```antlr
// 匹配特殊字符
LPAREN : '(' ;
RPAREN : ')' ;
LBRACE : '{' ;
RBRACE : '}' ;
LBRACK : '[' ;
RBRACK : ']' ;

// 在字符类中使用特殊字符
SPECIAL : [-+*/%^&|!~<>=] ;  // 减号放在开头
BRACKETS : [\[\]{}()] ;       // 方括号需要转义
```

## 处理缩进敏感语言

Python 风格的缩进处理：

```antlr
lexer grammar IndentLexer;

@members {
    private java.util.Stack<Integer> indentStack = new java.util.Stack<>();
    private java.util.Queue<Token> pendingTokens = new java.util.LinkedList<>();
    
    {
        indentStack.push(0);
    }
    
    @Override
    public Token nextToken() {
        if (!pendingTokens.isEmpty()) {
            return pendingTokens.poll();
        }
        return super.nextToken();
    }
}

NEWLINE : '\r'? '\n' [ \t]* 
    {
        int indent = getText().length() - getText().indexOf('\n') - 1;
        int prevIndent = indentStack.peek();
        
        if (indent > prevIndent) {
            indentStack.push(indent);
            emit(new CommonToken(INDENT, "INDENT"));
        } else {
            while (indent < indentStack.peek()) {
                indentStack.pop();
                pendingTokens.add(new CommonToken(DEDENT, "DEDENT"));
            }
        }
    }
    ;

INDENT : 'INDENT' ;  // 占位符
DEDENT : 'DEDENT' ;  // 占位符
```

## 性能优化

### 1. 避免回溯

```antlr
// ❌ 可能导致回溯
NUMBER : [0-9]+ | [0-9]+ '.' [0-9]+ ;

// ✅ 更高效
NUMBER : [0-9]+ ('.' [0-9]+)? ;
```

### 2. 使用 fragment

```antlr
// ✅ 使用 fragment 提高可读性和性能
fragment DIGIT : [0-9] ;
fragment LETTER : [a-zA-Z] ;

ID : LETTER (LETTER | DIGIT)* ;
NUMBER : DIGIT+ ;
```

### 3. 避免过长的规则

```antlr
// ❌ 过长的规则
COMPLEX : [a-zA-Z][a-zA-Z0-9_]*'.'[a-zA-Z][a-zA-Z0-9_]*'.'[a-zA-Z][a-zA-Z0-9_]* ;

// ✅ 分解为多个规则
fragment ID_PART : [a-zA-Z][a-zA-Z0-9_]* ;
QUALIFIED_ID : ID_PART ('.' ID_PART)+ ;
```

## 调试词法规则

### 打印所有 Token

```typescript
function printTokens(lexer: Lexer): void {
    let token = lexer.nextToken();
    while (token.type !== Token.EOF) {
        console.log(`[${token.line}:${token.charPositionInLine}] ` +
            `${lexer.symbolicNames[token.type]} = "${token.text}"`);
        token = lexer.nextToken();
    }
}
```

### 检查词法错误

```typescript
class LexerErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        console.error(`词法错误: 第${line}行第${column}列 - ${msg}`);
    }
}

lexer.removeErrorListeners();
lexer.addErrorListener(new LexerErrorListener());
```

## 常见问题解决

### 问题 1：Token 优先级冲突

```antlr
// ❌ 问题：FOR 和 ID 冲突
ID : [a-z]+ ;
FOR : 'for' ;

// ✅ 解决：关键字在前
FOR : 'for' ;
ID : [a-z]+ ;
```

### 问题 2：多行字符串

```antlr
// 支持多行字符串
MULTILINE_STRING : '"""' .*? '"""' ;
```

### 问题 3：嵌套注释

```antlr
// 使用模式处理嵌套注释
COMMENT : '/*' -> pushMode(COMMENT_MODE), skip ;

mode COMMENT_MODE;
    NESTED : '/*' -> pushMode(COMMENT_MODE), skip ;
    END : '*/' -> popMode, skip ;
    ANY : . -> skip ;
```
