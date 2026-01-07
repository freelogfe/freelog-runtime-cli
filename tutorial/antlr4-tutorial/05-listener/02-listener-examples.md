# Listener 案例集合

## 案例 1：表达式求值器（使用栈）

```typescript
export class EvalListener extends CalcListener {
    private stack: number[] = [];
    
    exitFactor(ctx: FactorContext): void {
        if (ctx.NUMBER()) {
            this.stack.push(parseFloat(ctx.NUMBER().getText()));
        }
    }
    
    exitTerm(ctx: TermContext): void {
        if (ctx.getChildCount() > 1) {
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
    
    exitExpression(ctx: ExpressionContext): number {
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

## 案例 2：标识符收集器

```typescript
export class IdentifierCollector extends MyListener {
    private identifiers: string[] = [];
    
    exitIdentifier(ctx: IdentifierContext): void {
        const id = ctx.ID().getText();
        if (!this.identifiers.includes(id)) {
            this.identifiers.push(id);
        }
    }
    
    getIdentifiers(): string[] {
        return this.identifiers;
    }
}
```

## 案例 3：代码格式化器

```typescript
export class FormatterListener extends MyListener {
    private output: string = '';
    private indent: number = 0;
    
    enterBlock(ctx: BlockContext): void {
        this.output += this.getIndent() + '{\n';
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

## 案例 4：符号表构建器

```typescript
export class SymbolTableListener extends MyListener {
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

## 案例 5：错误检查器

```typescript
export class ErrorChecker extends MyListener {
    private errors: string[] = [];
    
    exitAssignment(ctx: AssignmentContext): void {
        const varName = ctx.ID().getText();
        if (!this.isDefined(varName)) {
            this.errors.push(`未定义的变量: ${varName}`);
        }
    }
    
    exitFunctionCall(ctx: FunctionCallContext): void {
        const funcName = ctx.ID().getText();
        if (!this.isFunctionDefined(funcName)) {
            this.errors.push(`未定义的函数: ${funcName}`);
        }
    }
    
    getErrors(): string[] {
        return this.errors;
    }
    
    private isDefined(name: string): boolean {
        // 检查变量是否定义
        return false;
    }
    
    private isFunctionDefined(name: string): boolean {
        // 检查函数是否定义
        return false;
    }
}
```

## 案例 6：统计信息收集器

```typescript
export class StatisticsListener extends MyListener {
    private stats = {
        functionCount: 0,
        variableCount: 0,
        statementCount: 0,
        maxDepth: 0,
    };
    private depth: number = 0;
    
    enterFunction(ctx: FunctionContext): void {
        this.stats.functionCount++;
        this.depth++;
        this.stats.maxDepth = Math.max(this.stats.maxDepth, this.depth);
    }
    
    exitFunction(ctx: FunctionContext): void {
        this.depth--;
    }
    
    exitVariable(ctx: VariableContext): void {
        this.stats.variableCount++;
    }
    
    exitStatement(ctx: StatementContext): void {
        this.stats.statementCount++;
    }
    
    getStatistics() {
        return { ...this.stats };
    }
}
```

## 案例 7：代码度量工具

```typescript
export class MetricsListener extends MyListener {
    private metrics = {
        linesOfCode: 0,
        cyclomaticComplexity: 0,
        nestingDepth: 0,
    };
    private currentDepth: number = 0;
    
    enterIfStatement(ctx: IfStatementContext): void {
        this.metrics.cyclomaticComplexity++;
        this.currentDepth++;
        this.metrics.nestingDepth = Math.max(this.metrics.nestingDepth, this.currentDepth);
    }
    
    exitIfStatement(ctx: IfStatementContext): void {
        this.currentDepth--;
    }
    
    exitStatement(ctx: StatementContext): void {
        this.metrics.linesOfCode++;
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
}
```

## 案例 8：依赖关系分析器

```typescript
export class DependencyListener extends MyListener {
    private dependencies: Map<string, Set<string>> = new Map();
    private currentModule: string = '';
    
    enterModule(ctx: ModuleContext): void {
        this.currentModule = ctx.ID().getText();
        this.dependencies.set(this.currentModule, new Set());
    }
    
    exitImport(ctx: ImportContext): void {
        const importedModule = ctx.STRING().getText().slice(1, -1);
        const deps = this.dependencies.get(this.currentModule);
        deps?.add(importedModule);
    }
    
    getDependencies(): Map<string, Set<string>> {
        return this.dependencies;
    }
}
```

这些案例展示了 Listener 模式在不同场景下的应用。Listener 模式特别适合信息收集和副作用操作。
