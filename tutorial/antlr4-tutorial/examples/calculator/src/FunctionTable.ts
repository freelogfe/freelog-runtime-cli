/**
 * 函数表：存储可用的数学函数
 */
export class FunctionTable {
    private functions: Map<string, Function> = new Map();
    private variables: Map<string, number> = new Map();

    constructor() {
        this.initBuiltinFunctions();
    }

    private initBuiltinFunctions(): void {
        // 三角函数
        this.functions.set('sin', Math.sin);
        this.functions.set('cos', Math.cos);
        this.functions.set('tan', Math.tan);
        this.functions.set('asin', Math.asin);
        this.functions.set('acos', Math.acos);
        this.functions.set('atan', Math.atan);

        // 对数函数
        this.functions.set('log', Math.log);
        this.functions.set('log10', Math.log10);
        this.functions.set('log2', (x: number) => Math.log2(x));

        // 指数函数
        this.functions.set('exp', Math.exp);
        this.functions.set('sqrt', Math.sqrt);
        this.functions.set('pow', (x: number, y: number) => Math.pow(x, y));

        // 其他函数
        this.functions.set('abs', Math.abs);
        this.functions.set('floor', Math.floor);
        this.functions.set('ceil', Math.ceil);
        this.functions.set('round', Math.round);
        this.functions.set('max', Math.max);
        this.functions.set('min', Math.min);
    }

    /**
     * 调用函数
     */
    callFunction(name: string, args: number[]): number {
        const func = this.functions.get(name.toLowerCase());
        if (!func) {
            throw new Error(`未知函数: ${name}`);
        }

        // 检查参数数量
        if (name.toLowerCase() === 'pow' && args.length !== 2) {
            throw new Error(`函数 ${name} 需要 2 个参数`);
        }

        return func(...args);
    }

    /**
     * 检查函数是否存在
     */
    hasFunction(name: string): boolean {
        return this.functions.has(name.toLowerCase());
    }

    /**
     * 设置变量
     */
    setVariable(name: string, value: number): void {
        this.variables.set(name, value);
    }

    /**
     * 获取变量值
     */
    getVariable(name: string): number {
        const value = this.variables.get(name);
        if (value === undefined) {
            throw new Error(`未定义变量: ${name}`);
        }
        return value;
    }

    /**
     * 检查变量是否存在
     */
    hasVariable(name: string): boolean {
        return this.variables.has(name);
    }
}
