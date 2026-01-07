import antlr4 from 'antlr4ts';
import { JSONLexer } from '../JSONLexer';
import { JSONParser } from '../JSONParser';
import { JSONValueVisitor } from './JSONVisitor';
import { JSONValue } from './types';

/**
 * 解析 JSON 字符串
 */
export function parseJSON(input: string): JSONValue {
    // 创建字符流
    const chars = new antlr4.InputStream(input);

    // 创建词法分析器
    const lexer = new JSONLexer(chars);

    // 创建 Token 流
    const tokens = new antlr4.CommonTokenStream(lexer);

    // 创建语法分析器
    const parser = new JSONParser(tokens);

    // 移除默认错误监听器
    parser.removeErrorListeners();

    // 添加自定义错误监听器
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            throw new Error(`JSON 解析错误: 第${line}行第${column}列 - ${msg}`);
        }
    });

    // 解析并获取 AST
    const tree = parser.json();

    // 创建 Visitor 并遍历 AST
    const visitor = new JSONValueVisitor();
    const result = visitor.visit(tree);

    return result;
}

// 主程序
if (require.main === module) {
    const testCases = [
        '{"name": "John", "age": 30}',
        '[1, 2, 3, 4, 5]',
        '{"users": [{"name": "Alice"}, {"name": "Bob"}]}',
        '{"escaped": "Hello\\nWorld"}',
        '{"unicode": "\\u0041"}',
        'true',
        'false',
        'null',
        '42',
        '"Hello World"',
    ];

    console.log('=== JSON 解析器测试 ===\n');

    testCases.forEach(jsonStr => {
        try {
            const result = parseJSON(jsonStr);
            console.log(`输入: ${jsonStr}`);
            console.log(`结果:`, JSON.stringify(result, null, 2));
            console.log('');
        } catch (error: any) {
            console.error(`错误: ${jsonStr} - ${error.message}\n`);
        }
    });
}
