# 错误处理

## 默认错误处理

ANTLR4 默认会提供基本的错误处理，但通常我们需要自定义错误处理来提供更好的用户体验。

## 自定义错误监听器

### 1. 创建错误监听器

```typescript
import { ErrorListener } from 'antlr4ts';

class MyErrorListener extends ErrorListener<any> {
    private errors: string[] = [];

    syntaxError(
        recognizer: any,
        offendingSymbol: any,
        line: number,
        column: number,
        msg: string,
        e: any
    ): void {
        const error = `语法错误: 第${line}行第${column}列 - ${msg}`;
        this.errors.push(error);
        console.error(error);
    }

    getErrors(): string[] {
        return this.errors;
    }
}
```

### 2. 使用错误监听器

```typescript
const parser = new MyParser(tokens);

// 移除默认错误监听器
parser.removeErrorListeners();

// 添加自定义错误监听器
const errorListener = new MyErrorListener();
parser.addErrorListener(errorListener);

const tree = parser.program();

// 检查错误
if (errorListener.getErrors().length > 0) {
    console.error('解析失败:', errorListener.getErrors());
}
```

## 错误恢复策略

ANTLR4 使用默认的错误恢复策略，但你可以自定义：

```typescript
// 使用 BailErrorStrategy（遇到错误立即停止）
parser._errHandler = new antlr4.error.BailErrorStrategy();
```

## 常见错误类型

### 1. 词法错误

```typescript
class LexerErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        console.error(`词法错误: 第${line}行第${column}列 - ${msg}`);
    }
}

const lexer = new MyLexer(chars);
lexer.removeErrorListeners();
lexer.addErrorListener(new LexerErrorListener());
```

### 2. 语法错误

```typescript
class ParserErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        console.error(`语法错误: 第${line}行第${column}列 - ${msg}`);
        if (offendingSymbol) {
            console.error(`错误符号: ${offendingSymbol.text}`);
        }
    }
}
```

## 错误信息增强

```typescript
class EnhancedErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        // 获取上下文信息
        const context = recognizer.getContext();
        const expectedTokens = recognizer.getExpectedTokens();
        
        // 构建详细的错误信息
        const errorInfo = {
            line,
            column,
            message: msg,
            offendingSymbol: offendingSymbol?.text,
            expectedTokens: Array.from(expectedTokens.toArray())
                .map(t => recognizer.getTokenNames()[t])
                .filter(Boolean),
        };
        
        console.error('详细错误信息:', errorInfo);
    }
}
```

## 最佳实践

1. **提供清晰的错误信息**：包含行号、列号和具体错误原因
2. **收集所有错误**：不要遇到第一个错误就停止
3. **提供修复建议**：如果可能，建议如何修复错误
4. **错误定位**：帮助用户快速定位错误位置
