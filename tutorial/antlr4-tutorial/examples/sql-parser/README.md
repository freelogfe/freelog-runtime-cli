# SQL 解析器案例

一个简化版的 SQL 解析器，支持 SELECT、INSERT、UPDATE、DELETE 语句。

## 功能特性

- ✅ SELECT 查询语句
- ✅ INSERT 插入语句
- ✅ UPDATE 更新语句
- ✅ DELETE 删除语句
- ✅ WHERE 子句
- ✅ JOIN 操作

## 项目结构

```
sql-parser/
├── README.md
├── package.json
├── tsconfig.json
├── SQL.g4              # SQL 语法文件
├── src/
│   ├── main.ts          # 主程序
│   └── SQLVisitor.ts    # SQL Visitor
└── test/
    └── test.ts          # 测试用例
```

## 快速开始

```bash
npm install
npm run generate
npm run build
npm start
```

## 使用示例

```typescript
import { parseSQL } from './src/main';

// SELECT 语句
const select = parseSQL('SELECT name, age FROM users WHERE age > 18');

// INSERT 语句
const insert = parseSQL('INSERT INTO users (name, age) VALUES ("John", 30)');

// UPDATE 语句
const update = parseSQL('UPDATE users SET age = 31 WHERE name = "John"');

// DELETE 语句
const delete_ = parseSQL('DELETE FROM users WHERE age < 18');
```

## 学习重点

1. **多语句解析**：学习如何解析不同类型的 SQL 语句
2. **关键字处理**：理解如何处理 SQL 关键字
3. **复杂查询结构**：学习解析 SELECT、JOIN 等复杂结构
4. **AST 转换**：学习如何将 SQL 转换为可执行的结构
