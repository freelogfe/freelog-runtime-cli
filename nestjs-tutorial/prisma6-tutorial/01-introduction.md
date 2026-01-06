# 01. Prisma 6 简介与安装

## 什么是 Prisma？

Prisma 是下一代 Node.js 和 TypeScript ORM，它包含以下工具：

```
┌─────────────────────────────────────────────────────────────┐
│                        Prisma 生态                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Prisma Client  │  │  Prisma Migrate │  │Prisma Studio│ │
│  │   类型安全的     │  │   声明式数据库   │  │  可视化数据  │ │
│  │   数据库客户端   │  │   迁移工具       │  │  管理界面   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Prisma Schema                        ││
│  │              数据模型定义语言 (DSL)                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prisma 6 新特性

| 特性 | 说明 |
|------|------|
| 多 Schema 文件 | 支持将 Schema 拆分为多个文件 |
| 改进的类型安全 | 更精确的 TypeScript 类型推断 |
| 性能提升 | 查询引擎优化，更快的响应 |
| 更好的错误信息 | 更清晰的错误提示和调试信息 |
| 原生 ESM 支持 | 完整的 ES Modules 支持 |

## 安装 Prisma

### 1. 创建项目

```bash
# 创建新项目
mkdir prisma-demo
cd prisma-demo

# 初始化 package.json
npm init -y

# 安装 TypeScript
npm install typescript ts-node @types/node -D

# 初始化 TypeScript
npx tsc --init
```

### 2. 安装 Prisma

```bash
# 安装 Prisma CLI（开发依赖）
npm install prisma -D

# 安装 Prisma Client（运行时依赖）
npm install @prisma/client
```

### 3. 初始化 Prisma

```bash
# 初始化（默认 PostgreSQL）
npx prisma init

# 指定数据库类型
npx prisma init --datasource-provider mysql
npx prisma init --datasource-provider mongodb
```

初始化后的目录结构：

```
prisma-demo/
├── prisma/
│   └── schema.prisma    # Prisma Schema 文件
├── .env                 # 环境变量
├── package.json
└── tsconfig.json
```

### 4. 配置 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Prisma CLI 命令

| 命令 | 说明 |
|------|------|
| `npx prisma init` | 初始化 Prisma 项目 |
| `npx prisma generate` | 生成 Prisma Client |
| `npx prisma db push` | 同步 Schema 到数据库（不创建迁移） |
| `npx prisma db pull` | 从数据库拉取 Schema |
| `npx prisma migrate dev` | 创建并应用迁移（开发环境） |
| `npx prisma migrate deploy` | 应用迁移（生产环境） |
| `npx prisma migrate reset` | 重置数据库 |
| `npx prisma studio` | 启动可视化管理界面 |
| `npx prisma format` | 格式化 Schema 文件 |
| `npx prisma validate` | 验证 Schema 文件 |

## 第一个示例

### 1. 编写 Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
```

### 2. 配置环境变量

```env
# .env
DATABASE_URL="mysql://root:password@localhost:3306/prisma_demo"
```

### 3. 同步数据库

```bash
# 同步 Schema 到数据库
npx prisma db push

# 生成 Prisma Client
npx prisma generate
```

### 4. 使用 Prisma Client

```typescript
// src/index.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 创建用户
  const user = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
    },
  });
  console.log('Created user:', user);

  // 查询所有用户
  const users = await prisma.user.findMany();
  console.log('All users:', users);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 5. 运行

```bash
npx ts-node src/index.ts
```

## Prisma Studio

Prisma 提供了一个可视化的数据库管理界面：

```bash
npx prisma studio
```

访问 http://localhost:5555 即可查看和编辑数据。

## 下一步

[👉 02. Schema 语法详解](./02-schema.md)
