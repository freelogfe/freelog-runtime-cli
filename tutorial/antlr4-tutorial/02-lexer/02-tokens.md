# Token 详解

## Token 的结构

Token 包含以下信息：
- **类型（Type）**：Token 的种类（如 NUMBER, ID, PLUS）
- **文本（Text）**：匹配到的实际文本内容
- **行号（Line）**：Token 所在的行号
- **列号（Column）**：Token 所在的列号
- **通道（Channel）**：Token 所在的通道（默认 0，隐藏通道通常为 HIDDEN）

## 访问 Token

### 在 Visitor 中访问 Token

```typescript
visitExpression(ctx: ExpressionContext): void {
    // 获取 NUMBER Token
    const numberToken = ctx.NUMBER();
    if (numberToken) {
        const text = numberToken.getText();
        const line = numberToken.symbol.line;
        const column = numberToken.symbol.charPositionInLine;
    }
}
```

### 在 Listener 中访问 Token

```typescript
exitExpression(ctx: ExpressionContext): void {
    const tokens = ctx.NUMBER();
    for (const token of tokens) {
        console.log(`Token: ${token.getText()}`);
    }
}
```

## Token 流操作

```typescript
const tokens = new CommonTokenStream(lexer);

// 填充所有 Token
tokens.fill();

// 获取 Token 数量
const count = tokens.size();

// 获取特定位置的 Token
const token = tokens.get(5);

// 获取所有 Token
for (let i = 0; i < tokens.size(); i++) {
    const token = tokens.get(i);
    console.log(`Token ${i}: ${token.text}`);
}
```

## Token 通道

### 默认通道

```antlr
// 默认通道（通道 0）
NUMBER : [0-9]+ ;
```

### 隐藏通道

```antlr
// 发送到隐藏通道
WS : [ \t\r\n]+ -> channel(HIDDEN) ;
COMMENT : '//' ~[\r\n]* -> channel(HIDDEN) ;
```

### 访问隐藏通道的 Token

```typescript
// 获取所有通道的 Token
const allTokens = tokens.getTokens();

// 过滤特定通道的 Token
const hiddenTokens = allTokens.filter(t => t.channel === Lexer.HIDDEN);
```

## Token 类型

### 获取 Token 类型名称

```typescript
const lexer = new MyLexer(chars);
const token = tokens.get(5);

// 获取类型名称
const typeName = lexer.symbolicNames[token.type];
console.log(`Token 类型: ${typeName}`);
```

### 检查 Token 类型

```typescript
if (token.type === MyLexer.NUMBER) {
    // 是数字 Token
}

if (token.type === MyLexer.ID) {
    // 是标识符 Token
}
```

## EOF Token

每个 Token 流都以 EOF Token 结束：

```typescript
const eofToken = tokens.get(tokens.size() - 1);
if (eofToken.type === Token.EOF) {
    console.log('到达文件末尾');
}
```

## 实战技巧

### 1. 调试 Token 流

```typescript
function debugTokens(tokens: CommonTokenStream, lexer: any): void {
    tokens.fill();
    for (let i = 0; i < tokens.size(); i++) {
        const token = tokens.get(i);
        const typeName = lexer.symbolicNames[token.type] || `UNKNOWN(${token.type})`;
        console.log(`[${token.line}:${token.charPositionInLine}] ${typeName} = "${token.text}"`);
    }
}
```

### 2. 查找特定 Token

```typescript
function findTokens(tokens: CommonTokenStream, type: number): Token[] {
    tokens.fill();
    const result: Token[] = [];
    for (let i = 0; i < tokens.size(); i++) {
        const token = tokens.get(i);
        if (token.type === type) {
            result.push(token);
        }
    }
    return result;
}
```

### 3. 获取 Token 周围的上下文

```typescript
function getContext(tokens: CommonTokenStream, index: number, window: number = 3): Token[] {
    tokens.fill();
    const start = Math.max(0, index - window);
    const end = Math.min(tokens.size(), index + window + 1);
    const context: Token[] = [];
    for (let i = start; i < end; i++) {
        context.push(tokens.get(i));
    }
    return context;
}
```
