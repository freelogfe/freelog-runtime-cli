import antlr4 from 'antlr4ts';
import { CalcLexer } from '../CalcLexer';
import { CalcParser } from '../CalcParser';
import { EvalVisitor } from './EvalVisitor';
import { FunctionTable } from './FunctionTable';

/**
 * 计算表达式
 */
export function calculate(input: string): number {
    // 创建字符流
    const chars = new antlr4.InputStream(input);

    // 创建词法分析器
    const lexer = new CalcLexer(chars);

    // 创建 Token 流
    const tokens = new antlr4.CommonTokenStream(lexer);

    // 创建语法分析器
    const parser = new CalcParser(tokens);

    // 移除默认错误监听器
    parser.removeErrorListeners();

    // 添加自定义错误监听器
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            throw new Error(`语法错误: 第${line}行第${column}列 - ${msg}`);
        }
    });

    // 解析并获取 AST
    const tree = parser.program();

    // 创建 Visitor 并遍历 AST
    const functionTable = new FunctionTable();
    const visitor = new EvalVisitor(functionTable);
    const result = visitor.visit(tree);

    return result;
}

// 主程序
if (require.main === module) {
    const testCases = [
        '3 + 4',
        '3 + 4 * 5',
        '(3 + 4) * 5',
        '10 / 2 + 3',
        '2 * 3 + 4 * 5',
        'sin(0)',
        'cos(0)',
        'sqrt(16)',
        'pow(2, 3)',
        'x = 10',
        'x * 2',
        'y = 5',
        'x + y',
    ];

    console.log('=== 计算器测试 ===\n');

    const functionTable = new FunctionTable();

    testCases.forEach(expr => {
        try {
            const result = calculate(expr);
            console.log(`${expr.padEnd(20)} = ${result}`);
        } catch (error: any) {
            console.error(`错误: ${expr} - ${error.message}`);
        }
    });
}
