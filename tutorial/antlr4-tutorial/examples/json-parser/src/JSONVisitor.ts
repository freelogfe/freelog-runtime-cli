import { JSONVisitor } from '../JSONVisitor';
import { JSONParser } from '../JSONParser';
import { JSONValue, JSONObject, JSONArray } from './types';

export class JSONValueVisitor extends JSONVisitor<JSONValue> {
    // 访问 JSON 值
    visitJson(ctx: JSONParser.JsonContext): JSONValue {
        return this.visit(ctx.value());
    }

    // 访问值
    visitValue(ctx: JSONParser.ValueContext): JSONValue {
        if (ctx.object()) {
            return this.visit(ctx.object());
        }
        if (ctx.array()) {
            return this.visit(ctx.array());
        }
        if (ctx.STRING()) {
            return this.parseString(ctx.STRING().getText());
        }
        if (ctx.NUMBER()) {
            return parseFloat(ctx.NUMBER().getText());
        }
        if (ctx.getText() === 'true') {
            return true;
        }
        if (ctx.getText() === 'false') {
            return false;
        }
        if (ctx.getText() === 'null') {
            return null;
        }
        throw new Error('未知的值类型');
    }

    // 访问对象
    visitObject(ctx: JSONParser.ObjectContext): JSONObject {
        const obj: JSONObject = {};
        
        const pairs = ctx.pair();
        for (const pair of pairs) {
            const key = this.parseString(pair.STRING().getText());
            const value = this.visit(pair.value());
            obj[key] = value;
        }
        
        return obj;
    }

    // 访问数组
    visitArray(ctx: JSONParser.ArrayContext): JSONArray {
        const arr: JSONArray = [];
        
        const values = ctx.value();
        for (const value of values) {
            arr.push(this.visit(value));
        }
        
        return arr;
    }

    // 解析字符串（处理转义字符）
    private parseString(str: string): string {
        // 移除首尾引号
        str = str.slice(1, -1);
        
        // 处理转义字符
        return str.replace(/\\(.)/g, (match, char) => {
            switch (char) {
                case '"': return '"';
                case '\\': return '\\';
                case '/': return '/';
                case 'b': return '\b';
                case 'f': return '\f';
                case 'n': return '\n';
                case 'r': return '\r';
                case 't': return '\t';
                case 'u': {
                    // Unicode 转义：\uXXXX
                    const hex = match.slice(2, 6);
                    return String.fromCharCode(parseInt(hex, 16));
                }
                default: return char;
            }
        });
    }
}
