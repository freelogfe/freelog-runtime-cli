import { CalcVisitor } from '../CalcVisitor';
import { CalcParser } from '../CalcParser';
import { FunctionTable } from './FunctionTable';

export class EvalVisitor extends CalcVisitor<number> {
    private functionTable: FunctionTable;

    constructor(functionTable: FunctionTable) {
        super();
        this.functionTable = functionTable;
    }

    // 访问程序
    visitProgram(ctx: CalcParser.ProgramContext): number {
        let lastResult = 0;
        const statements = ctx.statement();
        
        for (const stmt of statements) {
            lastResult = this.visit(stmt);
        }
        
        return lastResult;
    }

    // 访问语句
    visitStatement(ctx: CalcParser.StatementContext): number {
        if (ctx.assignment()) {
            return this.visit(ctx.assignment());
        } else if (ctx.expression()) {
            return this.visit(ctx.expression());
        }
        return 0;
    }

    // 访问赋值语句
    visitAssignment(ctx: CalcParser.AssignmentContext): number {
        const varName = ctx.ID().getText();
        const value = this.visit(ctx.expression());
        this.functionTable.setVariable(varName, value);
        return value;
    }

    // 访问表达式
    visitExpression(ctx: CalcParser.ExpressionContext): number {
        let result = this.visit(ctx.term(0));

        // 处理后续的 term
        const operators = ctx.children?.filter((_, i) => i % 2 === 1) || [];
        const terms = ctx.term();

        for (let i = 0; i < operators.length; i++) {
            const op = operators[i].getText();
            const termValue = this.visit(terms[i + 1]);

            if (op === '+') {
                result += termValue;
            } else if (op === '-') {
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
            } else if (op === '/') {
                if (factorValue === 0) {
                    throw new Error('除以零错误');
                }
                result /= factorValue;
            }
        }

        return result;
    }

    // 访问因子
    visitFactor(ctx: CalcParser.FactorContext): number {
        // 数字
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        }

        // 标识符（变量）
        if (ctx.ID()) {
            const varName = ctx.ID().getText();
            return this.functionTable.getVariable(varName);
        }

        // 函数调用
        if (ctx.function_call()) {
            return this.visit(ctx.function_call());
        }

        // 括号表达式
        if (ctx.expression()) {
            return this.visit(ctx.expression());
        }

        throw new Error('未知的因子类型');
    }

    // 访问函数调用
    visitFunction_call(ctx: CalcParser.Function_callContext): number {
        const funcName = ctx.ID().getText();
        const args: number[] = [];

        if (ctx.args()) {
            const argExpressions = ctx.args()!.expression();
            for (const argExpr of argExpressions) {
                args.push(this.visit(argExpr));
            }
        }

        return this.functionTable.callFunction(funcName, args);
    }
}
