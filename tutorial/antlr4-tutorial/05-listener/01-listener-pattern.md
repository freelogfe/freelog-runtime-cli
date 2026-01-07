# Listener 模式详解

## 什么是 Listener 模式？

Listener 模式是 ANTLR4 提供的另一种遍历 AST 的方式。与 Visitor 不同，Listener 使用事件驱动的方式，在进入和离开每个节点时触发回调。

## Listener vs Visitor

| 特性 | Listener | Visitor |
|------|----------|---------|
| **遍历方式** | 隐式（自动遍历） | 显式（手动控制） |
| **返回值** | 无返回值 | 支持返回值 |
| **遍历顺序** | 固定（深度优先） | 完全控制 |
| **适用场景** | 信息收集、副作用操作 | 代码生成、转换 |
| **性能** | 稍快（无返回值开销） | 稍慢 |

## Listener 基本用法

### 1. 生成 Listener

ANTLR4 默认会生成 Listener 接口：

```bash
antlr4 -Dlanguage=TypeScript MyGrammar.g4
```

这会生成 `MyGrammarListener.ts` 接口。

### 2. 实现 Listener

```typescript
import { MyGrammarListener } from './MyGrammarListener';
import { MyGrammarParser } from './MyGrammarParser';

export class MyListener extends MyGrammarListener {
    private result: number = 0;
    private stack: number[] = [];
    
    // 进入表达式节点
    enterExpression(ctx: MyGrammarParser.ExpressionContext): void {
        console.log('进入表达式');
    }
    
    // 离开表达式节点
    exitExpression(ctx: MyGrammarParser.ExpressionContext): void {
        const right = this.stack.pop()!;
        const left = this.stack.pop()!;
        const op = ctx.getChild(1).getText();
        
        if (op === '+') {
            this.stack.push(left + right);
        } else {
            this.stack.push(left - right);
        }
    }
    
    // 离开数字节点
    exitNumber(ctx: MyGrammarParser.NumberContext): void {
        const value = parseInt(ctx.NUMBER().getText());
        this.stack.push(value);
    }
    
    getResult(): number {
        return this.stack[0];
    }
}
```

### 3. 使用 Listener

```typescript
import { ParseTreeWalker } from 'antlr4';

const tree = parser.expression();
const listener = new MyListener();
ParseTreeWalker.DEFAULT.walk(listener, tree);
const result = listener.getResult();
```

## Listener 方法命名规则

ANTLR4 根据语法规则自动生成 Listener 方法：

```antlr
// 语法规则
expression : term (('+'|'-') term)* ;
term       : NUMBER ;

// 生成的 Listener 方法
enterExpression(ctx: ExpressionContext): void
exitExpression(ctx: ExpressionContext): void
enterTerm(ctx: TermContext): void
exitTerm(ctx: TermContext): void
```

**命名规则：**
- `enter` + 规则名（首字母大写）
- `exit` + 规则名（首字母大写）

## 遍历顺序

Listener 使用深度优先遍历：

```
enterExpression
  enterTerm
    exitTerm
  enterTerm
    exitTerm
exitExpression
```

## 实际案例

### 案例 1：表达式求值（使用栈）

```typescript
export class EvalListener extends CalcListener {
    private stack: number[] = [];
    
    exitFactor(ctx: CalcParser.FactorContext): void {
        if (ctx.NUMBER()) {
            const value = parseFloat(ctx.NUMBER().getText());
            this.stack.push(value);
        }
        // 括号表达式的结果已经在栈中
    }
    
    exitTerm(ctx: CalcParser.TermContext): void {
        if (ctx.getChildCount() > 1) {
            // 有运算符
            const right = this.stack.pop()!;
            const left = this.stack.pop()!;
            const op = ctx.getChild(1).getText();
            
            if (op === '*') {
                this.stack.push(left * right);
            } else {
                this.stack.push(left / right);
            }
        }
    }
    
    exitExpression(ctx: CalcParser.ExpressionContext): void {
        if (ctx.getChildCount() > 1) {
            const right = this.stack.pop()!;
            const left = this.stack.pop()!;
            const op = ctx.getChild(1).getText();
            
            if (op === '+') {
                this.stack.push(left + right);
            } else {
                this.stack.push(left - right);
            }
        }
    }
    
    getResult(): number {
        return this.stack[0];
    }
}
```

### 案例 2：收集所有标识符

```typescript
export class IdentifierCollector extends MyGrammarListener {
    private identifiers: string[] = [];
    
    exitIdentifier(ctx: IdentifierContext): void {
        const id = ctx.ID().getText();
        this.identifiers.push(id);
    }
    
    getIdentifiers(): string[] {
        return this.identifiers;
    }
}
```

### 案例 3：代码格式化

```typescript
export class FormatterListener extends MyGrammarListener {
    private output: string = '';
    private indent: number = 0;
    
    enterBlock(ctx: BlockContext): void {
        this.output += '{\n';
        this.indent++;
    }
    
    exitBlock(ctx: BlockContext): void {
        this.indent--;
        this.output += this.getIndent() + '}\n';
    }
    
    exitStatement(ctx: StatementContext): void {
        this.output += this.getIndent() + ctx.getText() + ';\n';
    }
    
    private getIndent(): string {
        return '  '.repeat(this.indent);
    }
    
    getFormattedCode(): string {
        return this.output;
    }
}
```

### 案例 4：符号表构建

```typescript
export class SymbolTableListener extends MyGrammarListener {
    private symbolTable: Map<string, Symbol> = new Map();
    private currentScope: Scope | null = null;
    
    enterFunction(ctx: FunctionContext): void {
        const name = ctx.ID().getText();
        const symbol = new FunctionSymbol(name);
        this.symbolTable.set(name, symbol);
        this.currentScope = new Scope(this.currentScope);
    }
    
    exitFunction(ctx: FunctionContext): void {
        this.currentScope = this.currentScope?.parent || null;
    }
    
    exitVariable(ctx: VariableContext): void {
        const name = ctx.ID().getText();
        const symbol = new VariableSymbol(name);
        this.currentScope?.addSymbol(symbol);
    }
    
    getSymbolTable(): Map<string, Symbol> {
        return this.symbolTable;
    }
}
```

## 最佳实践

### 1. 使用栈处理嵌套结构

```typescript
export class NestedListener extends MyGrammarListener {
    private stack: any[] = [];
    
    enterExpression(ctx: ExpressionContext): void {
        this.stack.push({});
    }
    
    exitExpression(ctx: ExpressionContext): void {
        const node = this.stack.pop();
        // 处理节点
    }
}
```

### 2. 使用成员变量存储状态

```typescript
export class StatefulListener extends MyGrammarListener {
    private depth: number = 0;
    private maxDepth: number = 0;
    
    enterExpression(ctx: ExpressionContext): void {
        this.depth++;
        this.maxDepth = Math.max(this.maxDepth, this.depth);
    }
    
    exitExpression(ctx: ExpressionContext): void {
        this.depth--;
    }
    
    getMaxDepth(): number {
        return this.maxDepth;
    }
}
```

### 3. 选择性实现方法

```typescript
export class SelectiveListener extends MyGrammarListener {
    // 只实现需要的方法，其他方法使用默认实现（空）
    exitExpression(ctx: ExpressionContext): void {
        // 只处理表达式
    }
}
```

## 常见问题

### Q: 如何访问父节点？

**A:** 使用成员变量跟踪上下文：

```typescript
export class ParentAwareListener extends MyGrammarListener {
    private parentStack: ParseTree[] = [];
    
    enterExpression(ctx: ExpressionContext): void {
        const parent = this.parentStack[this.parentStack.length - 1];
        // 使用 parent
        this.parentStack.push(ctx);
    }
    
    exitExpression(ctx: ExpressionContext): void {
        this.parentStack.pop();
    }
}
```

### Q: 如何跳过某些节点？

**A:** Listener 会自动遍历所有节点，但你可以选择不处理：

```typescript
exitUnwantedNode(ctx: UnwantedContext): void {
    // 什么都不做，相当于跳过
}
```

### Q: Listener 和 Visitor 哪个更好？

**A:** 取决于场景：
- **Listener**：适合信息收集、副作用操作
- **Visitor**：适合代码生成、转换、需要返回值的情况

## 下一步

- [Listener 案例](./02-listener-examples.md) - 更多实际案例
- [Visitor 模式教程](../04-visitor/01-visitor-pattern.md) - 学习 Visitor 模式
- [高级特性](../06-advanced/01-error-handling.md) - 学习错误处理
