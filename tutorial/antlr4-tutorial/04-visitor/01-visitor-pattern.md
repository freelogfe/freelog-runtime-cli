# Visitor 模式详解

## 什么是 Visitor 模式？

Visitor 模式是一种设计模式，用于在不修改对象结构的情况下，定义作用于这些对象的新操作。在 ANTLR4 中，Visitor 用于遍历和操作抽象语法树（AST）。

## Visitor vs Listener

| 特性 | Visitor | Listener |
|------|---------|----------|
| 遍历方式 | 显式（手动控制） | 隐式（自动遍历） |
| 返回值 | 支持返回值 | 无返回值 |
| 遍历顺序 | 完全控制 | 固定顺序（深度优先） |
| 适用场景 | 代码生成、转换 | 信息收集、副作用操作 |

## Visitor 基本用法

### 1. 生成 Visitor

在生成解析器时添加 `-visitor` 选项：

```bash
antlr4 -Dlanguage=TypeScript -visitor MyGrammar.g4
```

这会生成 `MyGrammarVisitor.ts` 接口。

### 2. 实现 Visitor

```typescript
import { MyGrammarVisitor } from './MyGrammarVisitor';
import { MyGrammarParser } from './MyGrammarParser';

export class MyVisitor extends MyGrammarVisitor<number> {
    // 访问表达式节点
    visitExpression(ctx: MyGrammarParser.ExpressionContext): number {
        // 访问子节点
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        
        // 根据运算符计算结果
        const op = ctx.getChild(1).getText();
        if (op === '+') {
            return left + right;
        } else {
            return left - right;
        }
    }
    
    // 访问数字节点
    visitNumber(ctx: MyGrammarParser.NumberContext): number {
        return parseInt(ctx.NUMBER().getText());
    }
}
```

### 3. 使用 Visitor

```typescript
const tree = parser.expression();
const visitor = new MyVisitor();
const result = visitor.visit(tree);
```

## Visitor 方法命名规则

ANTLR4 根据语法规则自动生成 Visitor 方法：

```antlr
// 语法规则
expression : term (('+'|'-') term)* ;
term       : NUMBER ;

// 生成的 Visitor 方法
visitExpression(ctx: ExpressionContext): T
visitTerm(ctx: TermContext): T
```

**命名规则：**
- 规则名首字母大写，前面加 `visit`
- 例如：`expression` → `visitExpression`

## 访问子节点

### 1. 访问单个子节点

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 访问第一个 term
    const term = this.visit(ctx.term(0));
    return term;
}
```

### 2. 访问多个子节点

```typescript
visitExpression(ctx: ExpressionContext): number {
    let result = this.visit(ctx.term(0));
    
    // 遍历所有 term
    for (let i = 1; i < ctx.term().length; i++) {
        const term = this.visit(ctx.term(i));
        const op = ctx.getChild(i * 2 - 1).getText();
        
        if (op === '+') {
            result += term;
        } else {
            result -= term;
        }
    }
    
    return result;
}
```

### 3. 访问所有子节点

```typescript
visitExpression(ctx: ExpressionContext): number {
    const children = ctx.children || [];
    // 处理所有子节点
    for (const child of children) {
        if (child instanceof TermContext) {
            this.visit(child);
        }
    }
}
```

## 访问 Token

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 获取运算符 Token
    const opToken = ctx.getChild(1);
    const op = opToken.getText();
    
    // 获取 NUMBER Token
    const numberToken = ctx.NUMBER();
    const value = parseInt(numberToken.getText());
}
```

## 控制遍历

Visitor 模式允许你完全控制遍历顺序：

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 先访问右子树
    const right = this.visit(ctx.term(1));
    
    // 再访问左子树
    const left = this.visit(ctx.term(0));
    
    // 自定义处理逻辑
    return process(left, right);
}
```

## 实际案例

### 案例 1：表达式求值

```typescript
export class EvalVisitor extends CalcVisitor<number> {
    visitExpression(ctx: CalcParser.ExpressionContext): number {
        let result = this.visit(ctx.term(0));
        
        const operators = ctx.children?.filter((_, i) => i % 2 === 1) || [];
        const terms = ctx.term();
        
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i].getText();
            const termValue = this.visit(terms[i + 1]);
            
            if (op === '+') {
                result += termValue;
            } else {
                result -= termValue;
            }
        }
        
        return result;
    }
    
    visitTerm(ctx: CalcParser.TermContext): number {
        let result = this.visit(ctx.factor(0));
        
        const operators = ctx.children?.filter((_, i) => i % 2 === 1) || [];
        const factors = ctx.factor();
        
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i].getText();
            const factorValue = this.visit(factors[i + 1]);
            
            if (op === '*') {
                result *= factorValue;
            } else {
                result /= factorValue;
            }
        }
        
        return result;
    }
    
    visitFactor(ctx: CalcParser.FactorContext): number {
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        } else {
            return this.visit(ctx.expression());
        }
    }
}
```

### 案例 2：代码生成

```typescript
export class CodeGenVisitor extends MyGrammarVisitor<string> {
    visitFunction(ctx: FunctionContext): string {
        const name = ctx.ID().getText();
        const params = this.visit(ctx.parameters());
        const body = this.visit(ctx.block());
        
        return `function ${name}(${params}) {\n${body}\n}`;
    }
    
    visitParameters(ctx: ParametersContext): string {
        const params = ctx.ID().map(id => id.getText());
        return params.join(', ');
    }
    
    visitBlock(ctx: BlockContext): string {
        const statements = ctx.statement()
            .map(stmt => this.visit(stmt))
            .join('\n');
        return statements;
    }
}
```

### 案例 3：AST 转换

```typescript
export class TransformVisitor extends MyGrammarVisitor<ASTNode> {
    visitExpression(ctx: ExpressionContext): ASTNode {
        // 转换为自定义 AST 节点
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        const op = ctx.getChild(1).getText();
        
        return new BinaryOpNode(op, left, right);
    }
}
```

## 最佳实践

### 1. 使用泛型指定返回类型

```typescript
export class MyVisitor extends MyGrammarVisitor<number> {
    // 所有方法返回 number
}
```

### 2. 处理可选节点

```typescript
visitOptional(ctx: OptionalContext): number {
    if (ctx.expression()) {
        return this.visit(ctx.expression());
    }
    return 0; // 默认值
}
```

### 3. 错误处理

```typescript
visitExpression(ctx: ExpressionContext): number {
    try {
        return this.visit(ctx.term(0));
    } catch (error) {
        console.error('计算错误:', error);
        throw error;
    }
}
```

### 4. 缓存结果

```typescript
private cache = new Map<ParseTree, number>();

visitExpression(ctx: ExpressionContext): number {
    if (this.cache.has(ctx)) {
        return this.cache.get(ctx)!;
    }
    
    const result = this.calculate(ctx);
    this.cache.set(ctx, result);
    return result;
}
```

## 常见问题

### Q: 如何跳过某些节点？

**A:** 不调用 `visit` 方法：

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 跳过第一个 term，只处理后面的
    let result = 0;
    for (let i = 1; i < ctx.term().length; i++) {
        result += this.visit(ctx.term(i));
    }
    return result;
}
```

### Q: 如何访问父节点？

**A:** Visitor 不直接支持，需要手动传递上下文或使用 Listener。

### Q: 如何修改 AST？

**A:** Visitor 主要用于读取和转换，不能直接修改。需要创建新的 AST。

## 下一步

- [树遍历](./02-tree-traversal.md) - 深入学习遍历技巧
- [Visitor 案例](./03-visitor-examples.md) - 更多实际案例
- [Listener 模式教程](../05-listener/01-listener-pattern.md) - 学习另一种模式
