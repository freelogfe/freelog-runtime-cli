# 为什么 Prisma 需要 MongoDB 副本集？

## 📚 官方说明

根据 [Prisma 官方文档](https://prisma.nodejs.cn/getting-started/prisma-orm/quickstart/mongodb)，Prisma ORM 在使用 MongoDB 时**确实需要副本集**。

## 🔍 原因分析

### 1. Prisma 内部使用事务

Prisma ORM 在 MongoDB 上执行操作时，**内部使用事务**来确保数据一致性，特别是：

- **嵌套写入操作**（如创建用户时同时创建关联的帖子）
- **某些字段更新**（如 `@updatedAt` 自动更新）
- **复杂查询操作**

### 2. MongoDB 事务要求

MongoDB 的**事务功能仅在副本集部署中可用**。单节点 MongoDB 不支持事务。

### 3. 我们的代码中的使用场景

检查我们的代码，以下操作可能需要事务：

```prisma
model Todo {
  updatedAt   DateTime @updatedAt  // 这个字段的自动更新可能需要事务
  // ...
}
```

虽然我们的代码看起来是简单的 CRUD 操作，但 Prisma 内部可能仍然使用事务来确保一致性。

## ✅ 解决方案

### 方案 1: 配置单节点副本集（推荐，最简单）

对于开发环境，单节点副本集就足够了：

```bash
# 1. 在 MongoDB 配置文件中添加
replication:
  replSetName: rs0

# 2. 重启 MongoDB 服务

# 3. 初始化副本集
rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })
```

### 方案 2: 使用 MongoDB Atlas（云服务）

MongoDB Atlas 默认已配置副本集，无需额外配置。

### 方案 3: 简化 Schema（不推荐）

理论上可以移除 `@updatedAt` 等需要事务的功能，但这会失去 Prisma 的便利性。

## 📝 官方文档说明

根据 Prisma 官方文档：

> Prisma ORM 在与 MongoDB 集成时，确实需要 MongoDB 以副本集模式运行。这是因为 Prisma ORM 内部使用事务来支持嵌套写入，而事务功能仅在副本集部署中可用。

## 🎯 结论

**这不是配置问题**，而是 Prisma ORM 的设计要求。即使是最简单的操作，Prisma 也可能使用事务来确保数据一致性。

**最佳实践**：
- ✅ 开发环境：使用单节点副本集（性能影响可忽略）
- ✅ 生产环境：使用多节点副本集（高可用性）

## 🚀 快速配置

使用我们提供的脚本：

```bash
# 以管理员身份运行
.\setup-replica-set.ps1

# 然后初始化
node init-replica-set.js
```

配置完成后，Prisma 就可以正常工作了！

