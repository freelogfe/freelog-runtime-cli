# ANTLR4 快速开始

让我们通过一个完整的例子，快速上手 ANTLR4！

## 目标

创建一个简单的计算器，能够解析和计算数学表达式，如：`3 + 4 * 5`

## 步骤 1：创建项目

```bash
mkdir calculator-tutorial
cd calculator-tutorial
npm init -y
npm install antlr4ts
npm install --save-dev antlr4ts-cli @types/node typescript ts-node
```

## 步骤 2：创建语法文件

创建 `Calc.g4`：

```antlr
grammar Calc;

// 语法规则
expression : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER | '(' expression ')' ;

// 词法规则
NUMBER : [0-9]+ ('.' [0-9]+)? ;  // 整数或小数
WS     : [ \t\r\n]+ -> skip ;     // 跳过空白字符
```

**规则说明：**
- `expression`：表达式，由多个 term 通过 + 或 - 连接
- `term`：项，由多个 factor 通过 * 或 / 连接
- `factor`：因子，可以是数字或括号表达式
- `NUMBER`：匹配数字
- `WS`：匹配空白字符并跳过

## 步骤 3：生成解析器代码

```bash
# 使用 antlr4ts-cli
antlr4ts Calc.g4

# 或使用 JAR 文件
antlr4 -Dlanguage=TypeScript -visitor Calc.g4
```

这会生成以下文件：
- `CalcLexer.ts` - 词法分析器
- `CalcParser.ts` - 语法分析器
- `CalcListener.ts` - Listener 接口
- `CalcVisitor.ts` - Visitor 接口

## 步骤 4：创建 Visitor 实现

创建 `src/EvalVisitor.ts`：

```typescript
import { CalcVisitor } from '../CalcVisitor';
import { CalcParser } from '../CalcParser';

export class EvalVisitor extends CalcVisitor<number> {
    // 访问表达式：term (('+'|'-') term)*
    visitExpression(ctx: CalcParser.ExpressionContext): number {
        let result = this.visit(ctx.term(0)); // 第一个 term
        
        // 遍历后续的 term
        for (let i = 1; i < ctx.term().length; i++) {
            const op = ctx._parent?.getChild(1)?.getText(); // 获取运算符
            const termValue = this.visit(ctx.term(i));
            
            if (ctx.getChild(i * 2 - 1)?.getText() === '+') {
                result += termValue;
            } else {
                result -= termValue;
            }
        }
        
        return result;
    }
    
    // 访问项：factor (('*'|'/') factor)*
    visitTerm(ctx: CalcParser.TermContext): number {
        let result = this.visit(ctx.factor(0));
        
        for (let i = 1; i < ctx.factor().length; i++) {
            const op = ctx.getChild(i * 2 - 1)?.getText();
            const factorValue = this.visit(ctx.factor(i));
            
            if (op === '*') {
                result *= factorValue;
            } else {
                result /= factorValue;
            }
        }
        
        return result;
    }
    
    // 访问因子：NUMBER | '(' expression ')'
    visitFactor(ctx: CalcParser.FactorContext): number {
        if (ctx.NUMBER()) {
            // 是数字
            return parseFloat(ctx.NUMBER().getText());
        } else {
            // 是括号表达式
            return this.visit(ctx.expression());
        }
    }
}
```

**更好的实现方式：**

创建 `src/EvalVisitor.ts`（改进版）：

```typescript
import { CalcVisitor } from '../CalcVisitor';
import { CalcParser } from '../CalcParser';

export class EvalVisitor extends CalcVisitor<number> {
    // 访问表达式
    visitExpression(ctx: CalcParser.ExpressionContext): number {
        let result = this.visit(ctx.term(0));
        
        // 获取所有运算符和 term
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
    
    // 访问项
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
    
    // 访问因子
    visitFactor(ctx: CalcParser.FactorContext): number {
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        } else {
            return this.visit(ctx.expression());
        }
    }
}
```

## 步骤 5：创建主程序

创建 `src/main.ts`：

```typescript
import antlr4 from 'antlr4';
import { CalcLexer } from '../CalcLexer';
import { CalcParser } from '../CalcParser';
import { EvalVisitor } from './EvalVisitor';

function calculate(input: string): number {
    // 1. 创建字符流
    const chars = new antlr4.InputStream(input);
    
    // 2. 创建词法分析器
    const lexer = new CalcLexer(chars);
    
    // 3. 创建 Token 流
    const tokens = new antlr4.CommonTokenStream(lexer);
    
    // 4. 创建语法分析器
    const parser = new CalcParser(tokens);
    
    // 5. 解析并获取 AST
    const tree = parser.expression();
    
    // 6. 创建 Visitor 并遍历 AST
    const visitor = new EvalVisitor();
    const result = visitor.visit(tree);
    
    return result;
}

// 测试
const expressions = [
    '3 + 4',
    '3 + 4 * 5',
    '(3 + 4) * 5',
    '10 / 2 + 3',
    '2 * 3 + 4 * 5'
];

console.log('=== 计算器测试 ===\n');
expressions.forEach(expr => {
    try {
        const result = calculate(expr);
        console.log(`${expr} = ${result}`);
    } catch (error) {
        console.error(`错误: ${expr} - ${error.message}`);
    }
});
```

## 步骤 6：配置 TypeScript

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## 步骤 7：运行程序

```bash
# 编译 TypeScript
tsc

# 运行
node dist/src/main.js

# 或直接运行 TypeScript
ts-node src/main.ts
```

## 预期输出

```
=== 计算器测试 ===

3 + 4 = 7
3 + 4 * 5 = 23
(3 + 4) * 5 = 35
10 / 2 + 3 = 8
2 * 3 + 4 * 5 = 26
```

## 理解代码流程

```
输入: "3 + 4 * 5"
  ↓
1. InputStream: 字符流
  ↓
2. Lexer: 词法分析
  Token流: [NUMBER(3), PLUS(+), NUMBER(4), MULT(*), NUMBER(5)]
  ↓
3. Parser: 语法分析
  AST: expression
       ├─ term (3)
       ├─ PLUS
       └─ term
           ├─ factor (4)
           ├─ MULT
           └─ factor (5)
  ↓
4. Visitor: 遍历 AST
  访问 expression → 访问 term(3) → 返回 3
  访问 term(4*5) → 访问 factor(4) → 返回 4
                  → 访问 factor(5) → 返回 5
                  → 4 * 5 = 20
  3 + 20 = 23
  ↓
5. 结果: 23
```

## 常见问题

### Q: 为什么运算符优先级正确？

**A:** 通过语法规则的结构体现优先级：
- `expression` 包含 `term`，所以 + - 优先级低
- `term` 包含 `factor`，所以 * / 优先级高
- 括号表达式在 `factor` 中，优先级最高

### Q: 如何调试语法树？

**A:** 添加调试输出：

```typescript
// 打印语法树
console.log(tree.toStringTree(parser.ruleNames));
```

### Q: 如何处理错误？

**A:** 添加错误监听器：

```typescript
import { ErrorListener } from 'antlr4';

class MyErrorListener extends ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.error(`语法错误: 第${line}行第${column}列 - ${msg}`);
    }
}

parser.removeErrorListeners();
parser.addErrorListener(new MyErrorListener());
```

## 下一步

- [词法分析教程](../02-lexer/01-lexer-basics.md) - 深入学习词法规则
- [语法分析教程](../03-parser/01-parser-basics.md) - 深入学习语法规则
- [计算器完整案例](../../examples/calculator/) - 查看完整项目
