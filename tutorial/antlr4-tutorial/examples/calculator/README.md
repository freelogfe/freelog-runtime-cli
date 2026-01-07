# 计算器案例

一个功能完整的计算器，支持四则运算、括号、函数调用等。

## 功能特性

- ✅ 基本四则运算（+, -, *, /）
- ✅ 括号支持
- ✅ 小数运算
- ✅ 函数调用（sin, cos, sqrt 等）
- ✅ 变量支持
- ✅ 错误处理

## 项目结构

```
calculator/
├── README.md
├── package.json
├── tsconfig.json
├── Calc.g4              # 语法文件
├── src/
│   ├── main.ts          # 主程序
│   ├── EvalVisitor.ts   # 求值 Visitor
│   └── FunctionTable.ts # 函数表
├── test/
│   └── test.ts          # 测试用例
└── gen/                 # 生成的代码（自动生成）
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

### 3. 编译 TypeScript

```bash
npm run build
```

### 4. 运行

```bash
npm start
# 或
node dist/src/main.js
```

### 5. 运行测试

```bash
npm test
```

## 使用示例

```typescript
import { calculate } from './src/main';

// 基本运算
console.log(calculate('3 + 4'));        // 7
console.log(calculate('3 + 4 * 5'));    // 23
console.log(calculate('(3 + 4) * 5'));  // 35

// 函数调用
console.log(calculate('sin(0)'));       // 0
console.log(calculate('sqrt(16)'));     // 4

// 变量
console.log(calculate('x = 10'));       // 10
console.log(calculate('x * 2'));        // 20
```

## 语法规则

```antlr
expression : assignment | expr ;
assignment : ID '=' expression ;
expr       : term (('+'|'-') term)* ;
term       : factor (('*'|'/') factor)* ;
factor     : NUMBER 
           | ID 
           | function_call
           | '(' expression ')' ;
function_call : ID '(' args? ')' ;
args       : expression (',' expression)* ;
```

## 学习重点

1. **表达式解析**：理解如何解析数学表达式
2. **运算符优先级**：通过规则层次体现优先级
3. **递归下降**：理解递归规则的使用
4. **Visitor 模式**：学习如何使用 Visitor 遍历 AST
5. **错误处理**：学习如何处理语法错误

## 扩展练习

1. 添加更多数学函数（log, pow, abs 等）
2. 支持科学计数法
3. 添加常量（PI, E）
4. 支持向量运算
5. 添加历史记录功能
