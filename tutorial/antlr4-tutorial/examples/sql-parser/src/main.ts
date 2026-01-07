import antlr4 from 'antlr4ts';
import { SQLLexer } from '../SQLLexer';
import { SQLParser } from '../SQLParser';
import { SQLVisitor } from './SQLVisitor';

export interface SQLStatement {
    type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    [key: string]: any;
}

export function parseSQL(input: string): SQLStatement {
    const chars = new antlr4.InputStream(input);
    const lexer = new SQLLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new SQLParser(tokens);

    parser.removeErrorListeners();
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            throw new Error(`SQL 解析错误: 第${line}行第${column}列 - ${msg}`);
        }
    });

    const tree = parser.sql_statement();
    const visitor = new SQLVisitor();
    return visitor.visit(tree);
}

if (require.main === module) {
    const testCases = [
        'SELECT name, age FROM users',
        'SELECT * FROM users WHERE age > 18',
        'INSERT INTO users (name, age) VALUES ("John", 30)',
        'UPDATE users SET age = 31 WHERE name = "John"',
        'DELETE FROM users WHERE age < 18',
    ];

    console.log('=== SQL 解析器测试 ===\n');

    testCases.forEach(sql => {
        try {
            const result = parseSQL(sql);
            console.log(`SQL: ${sql}`);
            console.log(`解析结果:`, JSON.stringify(result, null, 2));
            console.log('');
        } catch (error: any) {
            console.error(`错误: ${sql} - ${error.message}\n`);
        }
    });
}
