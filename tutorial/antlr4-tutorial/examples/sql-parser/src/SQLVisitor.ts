import { SQLVisitor } from '../SQLVisitor';
import { SQLParser } from '../SQLParser';
import { SQLStatement } from './main';

export class SQLVisitor extends SQLVisitor<SQLStatement> {
    visitSql_statement(ctx: SQLParser.Sql_statementContext): SQLStatement {
        if (ctx.select_statement()) {
            return this.visit(ctx.select_statement());
        }
        if (ctx.insert_statement()) {
            return this.visit(ctx.insert_statement());
        }
        if (ctx.update_statement()) {
            return this.visit(ctx.update_statement());
        }
        if (ctx.delete_statement()) {
            return this.visit(ctx.delete_statement());
        }
        throw new Error('未知的 SQL 语句类型');
    }

    visitSelect_statement(ctx: SQLParser.Select_statementContext): SQLStatement {
        const columns = this.visit(ctx.column_list());
        const table = ctx.table_name().ID().getText();
        const condition = ctx.condition() ? this.visit(ctx.condition()) : null;

        return {
            type: 'SELECT',
            columns,
            table,
            where: condition,
        };
    }

    visitInsert_statement(ctx: SQLParser.Insert_statementContext): SQLStatement {
        const table = ctx.table_name().ID().getText();
        const columns = this.visit(ctx.column_list());
        const values = this.visit(ctx.value_list());

        return {
            type: 'INSERT',
            table,
            columns,
            values,
        };
    }

    visitUpdate_statement(ctx: SQLParser.Update_statementContext): SQLStatement {
        const table = ctx.table_name().ID().getText();
        const assignments = this.visit(ctx.assignment_list());
        const condition = ctx.condition() ? this.visit(ctx.condition()) : null;

        return {
            type: 'UPDATE',
            table,
            assignments,
            where: condition,
        };
    }

    visitDelete_statement(ctx: SQLParser.Delete_statementContext): SQLStatement {
        const table = ctx.table_name().ID().getText();
        const condition = ctx.condition() ? this.visit(ctx.condition()) : null;

        return {
            type: 'DELETE',
            table,
            where: condition,
        };
    }

    visitColumn_list(ctx: SQLParser.Column_listContext): string[] {
        if (ctx.getText() === '*') {
            return ['*'];
        }
        return ctx.ID().map(id => id.getText());
    }

    visitValue_list(ctx: SQLParser.Value_listContext): any[] {
        return ctx.value().map(v => this.visitValue(v));
    }

    visitAssignment_list(ctx: SQLParser.Assignment_listContext): Record<string, any> {
        const assignments: Record<string, any> = {};
        for (const assignment of ctx.assignment()) {
            const key = assignment.ID().getText();
            const value = this.visitValue(assignment.value());
            assignments[key] = value;
        }
        return assignments;
    }

    visitCondition(ctx: SQLParser.ConditionContext): any {
        return this.visit(ctx.expression());
    }

    visitExpression(ctx: SQLParser.ExpressionContext): any {
        // 简化实现
        if (ctx.ID().length === 2) {
            return {
                left: ctx.ID(0).getText(),
                operator: ctx.operator().getText(),
                right: ctx.ID(1).getText(),
            };
        }
        if (ctx.ID().length === 1 && ctx.value()) {
            return {
                left: ctx.ID(0).getText(),
                operator: ctx.operator().getText(),
                right: this.visitValue(ctx.value()!),
            };
        }
        return null;
    }

    visitValue(ctx: SQLParser.ValueContext): any {
        if (ctx.STRING()) {
            const str = ctx.STRING().getText();
            return str.slice(1, -1); // 移除引号
        }
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        }
        if (ctx.ID()) {
            return ctx.ID().getText();
        }
        return null;
    }
}
