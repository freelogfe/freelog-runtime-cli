import { calculate } from '../src/main';

function test(name: string, expr: string, expected: number) {
    try {
        const result = calculate(expr);
        if (Math.abs(result - expected) < 0.0001) {
            console.log(`✅ ${name}: ${expr} = ${result}`);
        } else {
            console.error(`❌ ${name}: ${expr} = ${result}, 期望 ${expected}`);
        }
    } catch (error: any) {
        console.error(`❌ ${name}: ${expr} - ${error.message}`);
    }
}

console.log('=== 计算器单元测试 ===\n');

// 基本运算
test('加法', '3 + 4', 7);
test('减法', '10 - 3', 7);
test('乘法', '3 * 4', 12);
test('除法', '12 / 3', 4);

// 运算符优先级
test('优先级1', '3 + 4 * 5', 23);
test('优先级2', '(3 + 4) * 5', 35);
test('优先级3', '2 * 3 + 4 * 5', 26);

// 函数调用
test('sin函数', 'sin(0)', 0);
test('cos函数', 'cos(0)', 1);
test('sqrt函数', 'sqrt(16)', 4);
test('pow函数', 'pow(2, 3)', 8);

// 变量
test('变量赋值1', 'x = 10', 10);
test('变量使用1', 'x * 2', 20);
test('变量赋值2', 'y = 5', 5);
test('变量运算', 'x + y', 15);

console.log('\n=== 测试完成 ===');
