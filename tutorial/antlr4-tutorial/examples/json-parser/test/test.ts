import { parseJSON } from '../src/main';

function test(name: string, input: string, expected: any) {
    try {
        const result = parseJSON(input);
        if (JSON.stringify(result) === JSON.stringify(expected)) {
            console.log(`✅ ${name}`);
        } else {
            console.error(`❌ ${name}: 期望 ${JSON.stringify(expected)}, 得到 ${JSON.stringify(result)}`);
        }
    } catch (error: any) {
        console.error(`❌ ${name}: ${error.message}`);
    }
}

console.log('=== JSON 解析器单元测试 ===\n');

// 基本类型
test('字符串', '"hello"', 'hello');
test('数字', '42', 42);
test('小数', '3.14', 3.14);
test('负数', '-10', -10);
test('布尔值 true', 'true', true);
test('布尔值 false', 'false', false);
test('null', 'null', null);

// 数组
test('空数组', '[]', []);
test('数字数组', '[1, 2, 3]', [1, 2, 3]);
test('混合数组', '[1, "hello", true]', [1, 'hello', true]);

// 对象
test('空对象', '{}', {});
test('简单对象', '{"name": "John"}', { name: 'John' });
test('多属性对象', '{"name": "John", "age": 30}', { name: 'John', age: 30 });

// 嵌套结构
test('嵌套对象', '{"user": {"name": "Alice"}}', { user: { name: 'Alice' } });
test('对象数组', '[{"id": 1}, {"id": 2}]', [{ id: 1 }, { id: 2 }]);

console.log('\n=== 测试完成 ===');
