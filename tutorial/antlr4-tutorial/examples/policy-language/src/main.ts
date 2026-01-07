import antlr4 from 'antlr4ts';
import { PolicyLexer } from '../PolicyLexer';
import { PolicyParser } from '../PolicyParser';
import { PolicyVisitor } from './PolicyVisitor';
import { Policy } from './types';

export function parsePolicy(input: string): Policy {
    const chars = new antlr4.InputStream(input);
    const lexer = new PolicyLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new PolicyParser(tokens);

    parser.removeErrorListeners();
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            throw new Error(`策略解析错误: 第${line}行第${column}列 - ${msg}`);
        }
    });

    const tree = parser.policy();
    const visitor = new PolicyVisitor();
    return visitor.visit(tree);
}

if (require.main === module) {
    const policy = `
for public, user123

always active

initial[active]:
    ~freelog.SigningEvent("resource1") => signed

signed[active]:
    ~freelog.TransactionEvent("10", "self.account") => auth

auth:
    terminate
`;

    try {
        const result = parsePolicy(policy);
        console.log('=== 策略解析结果 ===\n');
        console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.error(`错误: ${error.message}`);
    }
}
