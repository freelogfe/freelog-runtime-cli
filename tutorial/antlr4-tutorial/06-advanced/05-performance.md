# 性能优化

## 语法优化

### 1. 避免回溯

回溯会显著降低解析性能。

```antlr
// ❌ 可能导致回溯
statement : 'if' expression 'then' statement
          | 'if' expression 'then' statement 'else' statement
          ;

// ✅ 使用左因子提取
statement : 'if' expression 'then' statement ('else' statement)?
          ;
```

### 2. 减少选择分支

```antlr
// ❌ 过多分支
expression : NUMBER
           | ID
           | STRING
           | BOOLEAN
           | '(' expression ')'
           | expression '+' expression
           | expression '-' expression
           | expression '*' expression
           | expression '/' expression
           ;

// ✅ 分层组织
expression : term (('+'|'-') term)* ;
term : factor (('*'|'/') factor)* ;
factor : NUMBER | ID | STRING | BOOLEAN | '(' expression ')' ;
```

### 3. 使用 fragment

```antlr
// ✅ 使用 fragment 减少 Token 类型
fragment DIGIT : [0-9] ;
fragment LETTER : [a-zA-Z] ;

NUMBER : DIGIT+ ;
ID : LETTER (LETTER | DIGIT)* ;
```

## 词法优化

### 1. 简化正则表达式

```antlr
// ❌ 复杂的正则
ID : [a-zA-Z_][a-zA-Z0-9_]* ;

// ✅ 如果不需要下划线
ID : [a-zA-Z][a-zA-Z0-9]* ;
```

### 2. 避免过度使用 `.*`

```antlr
// ❌ 贪婪匹配可能很慢
COMMENT : '/*' .* '*/' ;

// ✅ 非贪婪匹配
COMMENT : '/*' .*? '*/' ;

// ✅✅ 更好的方式
COMMENT : '/*' ~[*]* '*'+ (~[/*] ~[*]* '*'+)* '/' ;
```

### 3. 使用词法模式

```antlr
// ✅ 使用模式处理复杂结构
STRING_START : '"' -> pushMode(STRING_MODE) ;

mode STRING_MODE;
    STRING_CONTENT : ~["\\]+ ;
    ESCAPE : '\\' . ;
    STRING_END : '"' -> popMode ;
```

## 运行时优化

### 1. 重用 Lexer 和 Parser

```typescript
// ❌ 每次创建新实例
function parse(input: string): ParseTree {
    const lexer = new MyLexer(new InputStream(input));
    const parser = new MyParser(new CommonTokenStream(lexer));
    return parser.program();
}

// ✅ 重用实例
class Parser {
    private lexer: MyLexer;
    private parser: MyParser;
    
    constructor() {
        this.lexer = new MyLexer(null);
        this.parser = new MyParser(null);
    }
    
    parse(input: string): ParseTree {
        this.lexer.inputStream = new InputStream(input);
        this.lexer.reset();
        
        const tokens = new CommonTokenStream(this.lexer);
        this.parser.inputStream = tokens;
        this.parser.reset();
        
        return this.parser.program();
    }
}
```

### 2. 使用 SLL 模式

```typescript
// 先尝试 SLL 模式（更快），失败后再用 LL 模式
parser.interpreter.predictionMode = PredictionMode.SLL;

try {
    tree = parser.program();
} catch (e) {
    // 回退到 LL 模式
    tokens.seek(0);
    parser.reset();
    parser.interpreter.predictionMode = PredictionMode.LL;
    tree = parser.program();
}
```

### 3. 延迟解析

```typescript
// 只解析需要的部分
function parseExpression(input: string): ExpressionContext {
    const lexer = new MyLexer(new InputStream(input));
    const parser = new MyParser(new CommonTokenStream(lexer));
    return parser.expression();  // 只解析表达式
}
```

## 内存优化

### 1. 避免保存整个 Token 流

```typescript
// ❌ 保存所有 Token
const tokens = new CommonTokenStream(lexer);
tokens.fill();  // 加载所有 Token 到内存

// ✅ 按需处理
const tokens = new CommonTokenStream(lexer);
// 不调用 fill()，按需加载
```

### 2. 使用 UnbufferedTokenStream

```typescript
// 对于大文件，使用无缓冲 Token 流
const tokens = new UnbufferedTokenStream(lexer);
```

### 3. 及时释放资源

```typescript
// 解析完成后释放资源
tree = null;
parser = null;
lexer = null;
```

## 并行处理

### 1. 多线程解析

```typescript
// 使用 Worker 进行并行解析
const worker = new Worker('./parser-worker.js');

worker.postMessage({ input: largeInput });

worker.onmessage = (event) => {
    const result = event.data;
    // 处理结果
};
```

### 2. 分块解析

```typescript
// 将大文件分块解析
function parseChunks(input: string, chunkSize: number): ParseTree[] {
    const chunks = splitIntoChunks(input, chunkSize);
    return chunks.map(chunk => parse(chunk));
}
```

## 性能测试

### 基准测试

```typescript
function benchmark(input: string, iterations: number): void {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        parse(input);
        const end = performance.now();
        times.push(end - start);
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`平均: ${avg.toFixed(2)}ms`);
    console.log(`最小: ${min.toFixed(2)}ms`);
    console.log(`最大: ${max.toFixed(2)}ms`);
}
```

### 内存分析

```typescript
function measureMemory(input: string): void {
    const before = process.memoryUsage().heapUsed;
    
    const tree = parse(input);
    
    const after = process.memoryUsage().heapUsed;
    const used = (after - before) / 1024 / 1024;
    
    console.log(`内存使用: ${used.toFixed(2)}MB`);
}
```

## 最佳实践总结

1. **语法设计**：简化规则，减少回溯
2. **词法优化**：使用 fragment，简化正则
3. **运行时**：重用实例，使用 SLL 模式
4. **内存**：避免不必要的缓存
5. **测试**：进行基准测试，找出瓶颈
