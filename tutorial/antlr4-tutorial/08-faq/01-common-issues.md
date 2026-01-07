# 常见问题与解决方案

## 安装问题

### Q1: 提示找不到 java 命令

**症状**：
```
'java' is not recognized as an internal or external command
```

**解决方案**：
1. 确认已安装 Java JDK
2. 将 Java 添加到 PATH 环境变量
3. Windows: `C:\Program Files\Java\jdk-17\bin`
4. 重启终端

### Q2: antlr4ts 安装失败

**症状**：
```
npm ERR! code ENOENT
```

**解决方案**：
```bash
# 清除 npm 缓存
npm cache clean --force

# 重新安装
npm install antlr4ts
```

### Q3: 生成的代码无法编译

**症状**：TypeScript 编译错误

**解决方案**：
1. 确保 antlr4ts 版本与 antlr4ts-cli 版本匹配
2. 检查 tsconfig.json 配置
3. 安装类型定义：`npm install @types/antlr4ts`

## 语法问题

### Q4: "no viable alternative" 错误

**症状**：
```
no viable alternative at input 'xxx'
```

**原因**：输入不匹配任何语法规则

**解决方案**：
1. 打印 Token 流，检查词法分析是否正确
2. 检查语法规则是否覆盖所有情况
3. 添加错误恢复规则

```typescript
// 调试 Token 流
const tokens = new CommonTokenStream(lexer);
tokens.fill();
for (let i = 0; i < tokens.size(); i++) {
    console.log(tokens.get(i));
}
```

### Q5: 左递归错误

**症状**：
```
The following sets of rules are mutually left-recursive
```

**原因**：存在间接左递归

**解决方案**：
```antlr
// ❌ 间接左递归
a : b ;
b : a ;

// ✅ 重构语法
a : b | c ;
b : c | TERMINAL ;
```

### Q6: 关键字被识别为标识符

**症状**：`if` 被识别为 `ID` 而不是 `IF`

**原因**：词法规则顺序错误

**解决方案**：
```antlr
// ✅ 关键字规则放在前面
IF : 'if' ;
WHILE : 'while' ;
ID : [a-z]+ ;
```

### Q7: 运算符优先级错误

**症状**：`3 + 4 * 5` 计算结果为 35 而不是 23

**原因**：语法规则没有正确体现优先级

**解决方案**：
```antlr
// ✅ 通过规则层次体现优先级
expression : term (('+'|'-') term)* ;  // 低优先级
term : factor (('*'|'/') factor)* ;     // 高优先级
factor : NUMBER | '(' expression ')' ;
```

## 运行时问题

### Q8: 内存溢出

**症状**：
```
JavaScript heap out of memory
```

**原因**：解析大文件时内存不足

**解决方案**：
1. 增加 Node.js 内存限制：`node --max-old-space-size=4096`
2. 使用流式解析
3. 分块处理大文件

### Q9: 解析速度慢

**原因**：语法存在大量回溯

**解决方案**：
1. 使用 SLL 模式
2. 优化语法减少回溯
3. 使用左因子提取

```typescript
// 使用 SLL 模式
parser.interpreter.predictionMode = PredictionMode.SLL;
```

### Q10: Visitor 返回 undefined

**症状**：Visitor 方法返回 undefined

**原因**：忘记返回值或未正确调用 visit

**解决方案**：
```typescript
// ✅ 确保返回值
visitExpression(ctx: ExpressionContext): number {
    const left = this.visit(ctx.term(0));  // 调用 visit
    const right = this.visit(ctx.term(1));
    return left + right;  // 返回结果
}
```

## 错误处理问题

### Q11: 错误信息不清晰

**解决方案**：自定义错误监听器

```typescript
class MyErrorListener extends ErrorListener<any> {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        const expected = recognizer.getExpectedTokens();
        const expectedStr = expected.toArray()
            .map(t => recognizer.getTokenNames()[t])
            .join(', ');
        
        console.error(`错误: 第${line}行第${column}列`);
        console.error(`  ${msg}`);
        console.error(`  期望: ${expectedStr}`);
    }
}
```

### Q12: 如何收集所有错误

**解决方案**：
```typescript
class ErrorCollector extends ErrorListener<any> {
    private errors: string[] = [];
    
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        this.errors.push(`第${line}行第${column}列: ${msg}`);
    }
    
    getErrors(): string[] {
        return this.errors;
    }
}

// 使用
const errorCollector = new ErrorCollector();
parser.removeErrorListeners();
parser.addErrorListener(errorCollector);

const tree = parser.program();

if (errorCollector.getErrors().length > 0) {
    console.error('发现错误:', errorCollector.getErrors());
}
```

## Visitor vs Listener

### Q13: 应该使用 Visitor 还是 Listener？

**Visitor 适用场景**：
- 需要返回值
- 需要控制遍历顺序
- 代码生成、转换

**Listener 适用场景**：
- 不需要返回值
- 信息收集
- 副作用操作

### Q14: 如何在 Listener 中返回值？

**解决方案**：使用成员变量或栈

```typescript
class EvalListener extends MyListener {
    private stack: number[] = [];
    
    exitExpression(ctx: ExpressionContext): void {
        const right = this.stack.pop()!;
        const left = this.stack.pop()!;
        this.stack.push(left + right);
    }
    
    getResult(): number {
        return this.stack[0];
    }
}
```

## 词法模式问题

### Q15: 如何处理嵌套结构

**解决方案**：使用词法模式

```antlr
STRING_START : '"' -> pushMode(STRING_MODE) ;

mode STRING_MODE;
    STRING_CONTENT : ~["\\]+ ;
    ESCAPE : '\\' . ;
    STRING_END : '"' -> popMode ;
```

### Q16: 如何处理缩进敏感语言

**解决方案**：在词法分析器中生成 INDENT/DEDENT Token

参考 Python 的实现方式，使用词法动作生成缩进 Token。

## 调试技巧

### Q17: 如何查看语法树

```typescript
const tree = parser.program();
console.log(tree.toStringTree(parser.ruleNames));
```

### Q18: 如何查看 Token 流

```typescript
const tokens = new CommonTokenStream(lexer);
tokens.fill();

for (let i = 0; i < tokens.size(); i++) {
    const token = tokens.get(i);
    console.log(`${lexer.symbolicNames[token.type]} = "${token.text}"`);
}
```

### Q19: 如何调试规则匹配

使用 ANTLR4 的 trace 功能或添加日志：

```typescript
class DebugVisitor extends MyVisitor<any> {
    visitExpression(ctx: ExpressionContext): any {
        console.log(`进入 expression: ${ctx.getText()}`);
        const result = this.visitChildren(ctx);
        console.log(`离开 expression: ${result}`);
        return result;
    }
}
```

## 性能问题

### Q20: 如何提高解析性能

1. **优化语法**：减少回溯
2. **使用 SLL 模式**：更快但可能失败
3. **重用解析器实例**：避免重复创建
4. **使用缓存**：缓存解析结果

```typescript
// 重用解析器
class ReusableParser {
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
