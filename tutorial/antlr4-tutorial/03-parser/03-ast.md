# 抽象语法树（AST）

## 什么是 AST？

抽象语法树（Abstract Syntax Tree）是源代码的树形表示，每个节点代表一个语法结构。

## AST 的特点

1. **抽象**：不包含语法细节（如括号、分号）
2. **结构化**：以树的形式组织
3. **语义化**：每个节点代表一个语义单元

## AST 结构示例

```
输入: 3 + 4 * 5

AST:
expression
├─ term (3)
├─ '+'
└─ term
   ├─ factor (4)
   ├─ '*'
   └─ factor (5)
```

## 访问 AST 节点

### 1. 获取子节点

```typescript
visitExpression(ctx: ExpressionContext): void {
    // 获取所有子节点
    const children = ctx.children || [];
    
    // 获取特定类型的子节点
    const terms = ctx.term();
    const firstTerm = ctx.term(0);
}
```

### 2. 获取文本

```typescript
visitExpression(ctx: ExpressionContext): void {
    // 获取整个表达式的文本
    const text = ctx.getText();
    
    // 获取特定子节点的文本
    const termText = ctx.term(0).getText();
}
```

### 3. 获取位置信息

```typescript
visitExpression(ctx: ExpressionContext): void {
    const start = ctx.start;
    const stop = ctx.stop;
    
    console.log(`行号: ${start.line}`);
    console.log(`列号: ${start.charPositionInLine}`);
    console.log(`结束位置: ${stop.stop}`);
}
```

## AST 遍历

### 使用 Visitor

```typescript
const visitor = new MyVisitor();
const result = visitor.visit(tree);
```

### 使用 Listener

```typescript
const listener = new MyListener();
ParseTreeWalker.DEFAULT.walk(listener, tree);
```

### 手动遍历

```typescript
function traverse(node: ParseTree): void {
    if (node instanceof TerminalNode) {
        console.log(`Terminal: ${node.getText()}`);
    } else {
        const ruleNode = node as RuleContext;
        console.log(`Rule: ${ruleNode.constructor.name}`);
        
        const childCount = node.getChildCount();
        for (let i = 0; i < childCount; i++) {
            traverse(node.getChild(i));
        }
    }
}
```

## AST 转换

### 转换为自定义 AST

```typescript
class ASTConverter extends MyVisitor<ASTNode> {
    visitExpression(ctx: ExpressionContext): ASTNode {
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        const op = ctx.getChild(1).getText();
        
        return new BinaryExpression(op, left, right);
    }
}
```

### 转换为 JSON

```typescript
class JSONConverter extends MyVisitor<any> {
    visitExpression(ctx: ExpressionContext): any {
        return {
            type: 'Expression',
            left: this.visit(ctx.term(0)),
            operator: ctx.getChild(1).getText(),
            right: this.visit(ctx.term(1)),
        };
    }
}
```

## AST 操作

### 1. 查找节点

```typescript
function findNodes(node: ParseTree, predicate: (n: ParseTree) => boolean): ParseTree[] {
    const result: ParseTree[] = [];
    
    function traverse(n: ParseTree): void {
        if (predicate(n)) {
            result.push(n);
        }
        const childCount = n.getChildCount();
        for (let i = 0; i < childCount; i++) {
            traverse(n.getChild(i));
        }
    }
    
    traverse(node);
    return result;
}
```

### 2. 替换节点

ANTLR4 的 AST 是不可变的，如果需要替换节点，需要创建新的 AST。

### 3. 复制 AST

```typescript
function cloneAST(node: ParseTree): ParseTree {
    // 实现 AST 复制逻辑
    // 注意：ANTLR4 的 AST 通常不需要复制
}
```

## 可视化 AST

### 文本表示

```typescript
const tree = parser.expression();
console.log(tree.toStringTree(parser.ruleNames));
```

### 图形表示

可以使用工具将 AST 可视化，或编写自定义的可视化代码。

## 最佳实践

1. **理解 AST 结构**：熟悉你的语法生成的 AST 结构
2. **使用 Visitor/Listener**：不要手动遍历 AST
3. **保持 AST 简洁**：AST 应该只包含必要的语义信息
4. **文档化 AST**：记录 AST 的结构和含义
