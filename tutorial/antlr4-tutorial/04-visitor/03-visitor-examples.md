# Visitor 案例集合

## 案例 1：表达式求值器

```typescript
export class EvalVisitor extends CalcVisitor<number> {
    visitExpression(ctx: ExpressionContext): number {
        let result = this.visit(ctx.term(0));
        const operators = ctx.children?.filter((_, i) => i % 2 === 1) || [];
        const terms = ctx.term();
        
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i].getText();
            const termValue = this.visit(terms[i + 1]);
            
            if (op === '+') result += termValue;
            else result -= termValue;
        }
        return result;
    }
    
    visitTerm(ctx: TermContext): number {
        let result = this.visit(ctx.factor(0));
        const operators = ctx.children?.filter((_, i) => i % 2 === 1) || [];
        const factors = ctx.factor();
        
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i].getText();
            const factorValue = this.visit(factors[i + 1]);
            
            if (op === '*') result *= factorValue;
            else result /= factorValue;
        }
        return result;
    }
    
    visitFactor(ctx: FactorContext): number {
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        }
        return this.visit(ctx.expression());
    }
}
```

## 案例 2：代码生成器

```typescript
export class CodeGenVisitor extends MyVisitor<string> {
    visitFunction(ctx: FunctionContext): string {
        const name = ctx.ID().getText();
        const params = this.visit(ctx.parameters());
        const body = this.visit(ctx.block());
        
        return `function ${name}(${params}) {\n${body}\n}`;
    }
    
    visitParameters(ctx: ParametersContext): string {
        return ctx.ID().map(id => id.getText()).join(', ');
    }
    
    visitBlock(ctx: BlockContext): string {
        return ctx.statement()
            .map(stmt => this.visit(stmt))
            .join('\n');
    }
}
```

## 案例 3：AST 转换器

```typescript
export class ASTConverter extends MyVisitor<ASTNode> {
    visitExpression(ctx: ExpressionContext): ASTNode {
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        const op = ctx.getChild(1).getText();
        
        return new BinaryOpNode(op, left, right);
    }
    
    visitTerm(ctx: TermContext): ASTNode {
        return this.visit(ctx.factor(0));
    }
    
    visitFactor(ctx: FactorContext): ASTNode {
        if (ctx.NUMBER()) {
            return new NumberNode(parseFloat(ctx.NUMBER().getText()));
        }
        return this.visit(ctx.expression());
    }
}
```

## 案例 4：符号表构建器

```typescript
export class SymbolTableBuilder extends MyVisitor<void> {
    private symbolTable: Map<string, Symbol> = new Map();
    private currentScope: Scope | null = null;
    
    visitFunction(ctx: FunctionContext): void {
        const name = ctx.ID().getText();
        const symbol = new FunctionSymbol(name);
        this.symbolTable.set(name, symbol);
        
        const oldScope = this.currentScope;
        this.currentScope = new Scope(oldScope);
        
        this.visitChildren(ctx);
        
        this.currentScope = oldScope;
    }
    
    visitVariable(ctx: VariableContext): void {
        const name = ctx.ID().getText();
        const symbol = new VariableSymbol(name);
        this.currentScope?.addSymbol(symbol);
    }
}
```

## 案例 5：类型检查器

```typescript
export class TypeChecker extends MyVisitor<Type> {
    private symbolTable: SymbolTable;
    
    visitExpression(ctx: ExpressionContext): Type {
        const leftType = this.visit(ctx.term(0));
        const rightType = this.visit(ctx.term(1));
        
        if (leftType !== rightType) {
            throw new Error(`类型不匹配: ${leftType} 和 ${rightType}`);
        }
        
        return leftType;
    }
    
    visitFunctionCall(ctx: FunctionCallContext): Type {
        const funcName = ctx.ID().getText();
        const funcType = this.symbolTable.getFunction(funcName);
        
        if (!funcType) {
            throw new Error(`未定义的函数: ${funcName}`);
        }
        
        // 检查参数类型
        const args = ctx.expression();
        if (args.length !== funcType.paramTypes.length) {
            throw new Error(`参数数量不匹配`);
        }
        
        return funcType.returnType;
    }
}
```

## 案例 6：优化器

```typescript
export class Optimizer extends MyVisitor<ASTNode> {
    visitExpression(ctx: ExpressionContext): ASTNode {
        const left = this.visit(ctx.term(0));
        const right = this.visit(ctx.term(1));
        
        // 常量折叠
        if (left instanceof NumberNode && right instanceof NumberNode) {
            const result = this.evaluate(left.value, right.value, ctx.getChild(1).getText());
            return new NumberNode(result);
        }
        
        return new BinaryOpNode(ctx.getChild(1).getText(), left, right);
    }
    
    private evaluate(left: number, right: number, op: string): number {
        switch (op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            default: throw new Error(`未知运算符: ${op}`);
        }
    }
}
```

## 案例 7：格式化器

```typescript
export class Formatter extends MyVisitor<string> {
    private indent: number = 0;
    
    visitBlock(ctx: BlockContext): string {
        this.indent++;
        const statements = ctx.statement()
            .map(stmt => this.visit(stmt))
            .map(stmt => this.indentString(stmt))
            .join('\n');
        this.indent--;
        
        return `{\n${statements}\n${this.indentString('}')}`;
    }
    
    visitStatement(ctx: StatementContext): string {
        return this.visit(ctx.expression()) + ';';
    }
    
    private indentString(str: string): string {
        return '  '.repeat(this.indent) + str;
    }
}
```

## 案例 8：依赖分析器

```typescript
export class DependencyAnalyzer extends MyVisitor<Set<string>> {
    visitImport(ctx: ImportContext): Set<string> {
        const module = ctx.STRING().getText().slice(1, -1);
        return new Set([module]);
    }
    
    visitProgram(ctx: ProgramContext): Set<string> {
        const dependencies = new Set<string>();
        const imports = ctx.import();
        
        for (const imp of imports) {
            const deps = this.visit(imp);
            deps.forEach(dep => dependencies.add(dep));
        }
        
        return dependencies;
    }
}
```

这些案例展示了 Visitor 模式在不同场景下的应用。根据你的需求选择合适的模式。
