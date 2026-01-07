# JSON 解析器案例

一个完整的 JSON 解析器实现，支持 JSON 标准的所有特性。

## 功能特性

- ✅ 解析 JSON 对象
- ✅ 解析 JSON 数组
- ✅ 支持字符串、数字、布尔值、null
- ✅ 支持转义字符
- ✅ 支持 Unicode 转义
- ✅ 错误处理和报告

## 项目结构

```
json-parser/
├── README.md
├── package.json
├── tsconfig.json
├── JSON.g4              # JSON 语法文件
├── src/
│   ├── main.ts          # 主程序
│   ├── JSONVisitor.ts   # JSON Visitor
│   └── types.ts         # 类型定义
└── test/
    └── test.ts          # 测试用例
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 生成解析器代码

```bash
npm run generate
```

### 3. 编译和运行

```bash
npm run build
npm start
```

## 使用示例

```typescript
import { parseJSON } from './src/main';

// 解析 JSON 对象
const obj = parseJSON('{"name": "John", "age": 30}');
console.log(obj); // { name: 'John', age: 30 }

// 解析 JSON 数组
const arr = parseJSON('[1, 2, 3, 4, 5]');
console.log(arr); // [1, 2, 3, 4, 5]

// 解析嵌套结构
const nested = parseJSON('{"users": [{"name": "Alice"}, {"name": "Bob"}]}');
console.log(nested);
```

## 学习重点

1. **复杂数据结构解析**：学习如何解析对象和数组
2. **转义字符处理**：理解字符串转义机制
3. **递归结构**：理解如何解析嵌套的 JSON
4. **类型转换**：学习如何将 Token 转换为 JavaScript 值

## JSON 语法规则

JSON 语法相对简单但完整：
- 值可以是：字符串、数字、布尔值、null、对象、数组
- 对象：键值对集合
- 数组：值的有序列表
- 字符串：支持转义字符和 Unicode
