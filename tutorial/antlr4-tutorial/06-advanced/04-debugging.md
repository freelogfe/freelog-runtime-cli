# 调试技巧

## 调试工具

### 1. ANTLR4 TestRig (grun)

ANTLR4 提供了一个命令行测试工具：

```bash
# 编译语法
antlr4 MyGrammar.g4
javac *.java

# 使用 TestRig
grun MyGrammar program -tokens    # 显示 Token
grun MyGrammar program -tree      # 显示语法树
grun MyGrammar program -gui       # 图形化显示语法树
grun MyGrammar program -trace     # 显示规则调用跟踪
```

### 2. VS Code 插件调试

使用 ANTLR4 插件可以：
- 实时预览语法树
- 语法高亮
- 错误检查
- 代码补全

## 代码级调试

### 打印 Token 流

```typescript
function debugTokens(input: string): void {
    const chars = new InputStream(input);
    const lexer = new MyLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    tokens.fill();
    
    console.log('=== Token 流 ===');
    for (let i = 0; i < tokens.size(); i++) {
        const token = tokens.get(i);
        const typeName = lexer.symbolicNames[token.type] || `UNKNOWN(${token.type})`;
        console.log(`[${i}] ${typeName.padEnd(15)} = "${token.text}" ` +
            `(${token.line}:${token.charPositionInLine})`);
    }
}
```

### 打印语法树

```typescript
function debugTree(input: string): void {
    const chars = new InputStream(input);
    const lexer = new MyLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MyParser(tokens);
    
    const tree = parser.program();
    
    console.log('=== 语法树 ===');
    console.log(tree.toStringTree(parser.ruleNames));
}
```

### 自定义树打印

```typescript
function printTree(node: ParseTree, indent: number = 0): void {
    const prefix = '  '.repeat(indent);
    
    if (node instanceof TerminalNode) {
        console.log(`${prefix}Terminal: "${node.getText()}"`);
    } else {
        const ruleNode = node as RuleContext;
        const ruleName = parser.ruleNames[ruleNode.ruleIndex];
        console.log(`${prefix}Rule: ${ruleName}`);
        
        for (let i = 0; i < node.getChildCount(); i++) {
            printTree(node.getChild(i), indent + 1);
        }
    }
}
```

## 调试 Visitor

### 添加日志

```typescript
class DebugVisitor extends MyVisitor<any> {
    private depth: number = 0;
    
    private log(msg: string): void {
        console.log('  '.repeat(this.depth) + msg);
    }
    
    visitExpression(ctx: ExpressionContext): any {
        this.log(`进入 Expression: ${ctx.getText()}`);
        this.depth++;
        
        const result = this.visitChildren(ctx);
        
        this.depth--;
        this.log(`离开 Expression: ${result}`);
        return result;
    }
}
```

### 断点调试

在 VS Code 中：
1. 在 Visitor 方法中设置断点
2. 使用 Debug 配置运行
3. 检查 `ctx` 对象的属性

## 调试 Listener

```typescript
class DebugListener extends MyListener {
    private depth: number = 0;
    
    enterEveryRule(ctx: ParserRuleContext): void {
        const ruleName = parser.ruleNames[ctx.ruleIndex];
        console.log('  '.repeat(this.depth) + `进入: ${ruleName}`);
        this.depth++;
    }
    
    exitEveryRule(ctx: ParserRuleContext): void {
        this.depth--;
        const ruleName = parser.ruleNames[ctx.ruleIndex];
        console.log('  '.repeat(this.depth) + `离开: ${ruleName}`);
    }
}
```

## 常见问题诊断

### 问题 1：规则不匹配

**症状**：解析失败，提示 "no viable alternative"

**诊断步骤**：
1. 打印 Token 流，检查词法分析是否正确
2. 检查规则顺序
3. 检查是否有遗漏的规则

```typescript
// 检查 Token 流
debugTokens(input);

// 检查是否有词法错误
if (lexer.getNumberOfSyntaxErrors() > 0) {
    console.error('词法错误');
}
```

### 问题 2：优先级错误

**症状**：表达式计算结果错误

**诊断步骤**：
1. 打印语法树，检查结构
2. 检查规则层次

```typescript
// 打印语法树
console.log(tree.toStringTree(parser.ruleNames));
```

### 问题 3：左递归问题

**症状**：堆栈溢出或无限循环

**诊断步骤**：
1. 检查是否有间接左递归
2. 重构语法消除左递归

### 问题 4：Token 优先级

**症状**：关键字被识别为标识符

**诊断步骤**：
1. 检查词法规则顺序
2. 确保关键字规则在标识符规则之前

## 性能调试

### 测量解析时间

```typescript
function measureParseTime(input: string): void {
    const start = Date.now();
    
    const chars = new InputStream(input);
    const lexer = new MyLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MyParser(tokens);
    const tree = parser.program();
    
    const end = Date.now();
    console.log(`解析时间: ${end - start}ms`);
}
```

### 检查规则调用次数

```typescript
class ProfilingListener extends MyListener {
    private ruleCounts: Map<string, number> = new Map();
    
    enterEveryRule(ctx: ParserRuleContext): void {
        const ruleName = parser.ruleNames[ctx.ruleIndex];
        const count = this.ruleCounts.get(ruleName) || 0;
        this.ruleCounts.set(ruleName, count + 1);
    }
    
    printProfile(): void {
        console.log('=== 规则调用统计 ===');
        for (const [rule, count] of this.ruleCounts) {
            console.log(`${rule}: ${count}`);
        }
    }
}
```

## 最佳实践

1. **增量调试**：从简单输入开始，逐步增加复杂度
2. **隔离问题**：将复杂语法拆分为小部分测试
3. **使用日志**：在关键位置添加日志输出
4. **单元测试**：为每个规则编写测试用例
5. **可视化**：使用图形化工具查看语法树
