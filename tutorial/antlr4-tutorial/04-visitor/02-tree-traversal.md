# 树遍历技巧

## 遍历顺序

### 深度优先遍历（默认）

ANTLR4 默认使用深度优先遍历：

```
expression
├─ term (先访问)
│  ├─ factor (先访问)
│  └─ factor (后访问)
└─ term (后访问)
```

### 前序遍历（Pre-order）

先访问节点，再访问子节点：

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 1. 处理当前节点
    console.log('访问表达式');
    
    // 2. 访问子节点
    const left = this.visit(ctx.term(0));
    const right = this.visit(ctx.term(1));
    
    return left + right;
}
```

### 后序遍历（Post-order）

先访问子节点，再处理当前节点：

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 1. 先访问子节点
    const left = this.visit(ctx.term(0));
    const right = this.visit(ctx.term(1));
    
    // 2. 处理当前节点
    return left + right;
}
```

## 遍历控制

### 1. 选择性遍历

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 只访问第一个 term
    return this.visit(ctx.term(0));
}
```

### 2. 条件遍历

```typescript
visitExpression(ctx: ExpressionContext): number {
    let result = this.visit(ctx.term(0));
    
    // 根据条件决定是否访问后续节点
    if (result > 0) {
        for (let i = 1; i < ctx.term().length; i++) {
            result += this.visit(ctx.term(i));
        }
    }
    
    return result;
}
```

### 3. 跳过某些节点

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

## 遍历模式

### 1. 自顶向下

```typescript
visitExpression(ctx: ExpressionContext): void {
    // 先处理当前节点
    this.processNode(ctx);
    
    // 再处理子节点
    for (const term of ctx.term()) {
        this.visit(term);
    }
}
```

### 2. 自底向上

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 先处理子节点
    const values = ctx.term().map(term => this.visit(term));
    
    // 再处理当前节点
    return this.combine(values);
}
```

## 实战技巧

### 1. 收集信息

```typescript
class CollectorVisitor extends MyVisitor<void> {
    private identifiers: string[] = [];
    
    visitIdentifier(ctx: IdentifierContext): void {
        this.identifiers.push(ctx.ID().getText());
        // 继续遍历子节点
        this.visitChildren(ctx);
    }
    
    getIdentifiers(): string[] {
        return this.identifiers;
    }
}
```

### 2. 转换 AST

```typescript
class TransformVisitor extends MyVisitor<ASTNode> {
    visitExpression(ctx: ExpressionContext): ASTNode {
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        return new BinaryOp('+', left, right);
    }
}
```

### 3. 验证 AST

```typescript
class ValidatorVisitor extends MyVisitor<boolean> {
    visitExpression(ctx: ExpressionContext): boolean {
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        
        // 验证表达式
        if (!left || !right) {
            throw new Error('表达式无效');
        }
        
        return true;
    }
}
```

## 性能优化

### 1. 缓存结果

```typescript
class CachedVisitor extends MyVisitor<number> {
    private cache = new Map<ParseTree, number>();
    
    visitExpression(ctx: ExpressionContext): number {
        if (this.cache.has(ctx)) {
            return this.cache.get(ctx)!;
        }
        
        const result = this.calculate(ctx);
        this.cache.set(ctx, result);
        return result;
    }
}
```

### 2. 提前终止

```typescript
visitExpression(ctx: ExpressionContext): number {
    // 如果第一个 term 为 0，提前返回
    const first = this.visit(ctx.term(0));
    if (first === 0) {
        return 0;
    }
    
    // 继续处理其他 term
    // ...
}
```

## 常见问题

### Q: 如何访问父节点？

**A:** Visitor 不直接支持，需要手动传递上下文：

```typescript
class ParentAwareVisitor extends MyVisitor<number> {
    private parentStack: ParseTree[] = [];
    
    visitExpression(ctx: ExpressionContext): number {
        this.parentStack.push(ctx);
        const result = this.visitChildren(ctx);
        this.parentStack.pop();
        return result;
    }
}
```

### Q: 如何修改 AST？

**A:** ANTLR4 的 AST 是不可变的，需要创建新的 AST。

### Q: 如何遍历所有节点？

**A:** 使用 `visitChildren` 或手动遍历所有子节点。
