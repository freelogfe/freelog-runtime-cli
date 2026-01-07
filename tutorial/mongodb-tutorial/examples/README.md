# MongoDB 案例代码说明

## 📁 文件说明

| 文件 | 说明 | 运行方式 |
|------|------|----------|
| `01-basic-operations.js` | 基础 CRUD 操作 | `node examples/01-basic-operations.js` |
| `02-query-operations.js` | 查询操作详解 | `node examples/02-query-operations.js` |
| `03-index-performance.js` | 索引与性能优化 | `node examples/03-index-performance.js` |
| `04-aggregation-pipeline.js` | 聚合管道 | `node examples/04-aggregation-pipeline.js` |
| `05-advanced-features.js` | 高级特性（事务、变更流） | `node examples/05-advanced-features.js` |
| `06-typegoose-practice.ts` | Typegoose 实践 | 需要 TypeScript 环境 |
| `07-best-practices.ts` | 最佳实践 | 需要 TypeScript 环境 |

## 🚀 运行前准备

### 1. 安装依赖

```bash
npm install mongodb
```

### 2. 启动 MongoDB

确保 MongoDB 服务已启动：

```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
# 或
mongod --dbpath /path/to/data
```

### 3. 运行示例

```bash
# JavaScript 示例
node docs/mongodb-tutorial/examples/01-basic-operations.js

# TypeScript 示例（需要先编译）
tsc docs/mongodb-tutorial/examples/06-typegoose-practice.ts
node docs/mongodb-tutorial/examples/06-typegoose-practice.js
```

## ⚠️ 注意事项

1. **事务示例**：`05-advanced-features.js` 中的事务功能需要副本集或分片集群，单机 MongoDB 无法测试
2. **TypeScript 示例**：需要配置 TypeScript 编译环境
3. **数据清理**：所有示例运行后会自动清理测试数据
4. **连接字符串**：默认使用 `mongodb://localhost:27017`，请根据实际情况修改

## 📝 修改连接字符串

如果您的 MongoDB 不在本地或使用不同的端口，请修改示例文件中的连接字符串：

```javascript
// 修改这一行
const uri = 'mongodb://localhost:27017';
// 改为您的连接字符串，例如：
// const uri = 'mongodb://username:password@host:port/database';
```

## 🔧 在项目中使用

这些示例代码可以直接集成到您的项目中：

1. **JavaScript 示例**：可以直接使用原生 MongoDB 驱动
2. **TypeScript 示例**：基于您的项目结构（MidwayJS + Typegoose），可以直接参考使用

## 📚 相关文档

- [第一章：基础入门](../01-基础入门.md)
- [第二章：查询操作](../02-查询操作.md)
- [第三章：索引与性能优化](../03-索引与性能优化.md)
- [第四章：聚合管道](../04-聚合管道.md)
- [第五章：事务与高级特性](../05-事务与高级特性.md)
- [第六章：Typegoose 实践](../06-Typegoose实践.md)
- [第七章：最佳实践](../07-最佳实践.md)

