# 00. NestJS CLI 完全指南

NestJS CLI 是官方提供的命令行工具，用于初始化、开发和维护 NestJS 应用程序。

## 安装 CLI

```bash
# 全局安装
npm install -g @nestjs/cli

# 或使用 pnpm
pnpm add -g @nestjs/cli

# 验证安装
nest --version
```

## 创建新项目

### 基本创建

```bash
nest new project-name
```

执行后会提示选择包管理器：
```
? Which package manager would you use? (Use arrow keys)
❯ npm
  yarn
  pnpm
```

### 创建选项

```bash
# 指定包管理器
nest new my-app --package-manager pnpm

# 跳过安装依赖
nest new my-app --skip-install

# 跳过 Git 初始化
nest new my-app --skip-git

# 使用严格模式 TypeScript
nest new my-app --strict

# 指定语言 (默认 TypeScript)
nest new my-app --language javascript

# 组合使用
nest new my-app -p pnpm --strict --skip-git
```

### 创建选项速查表

| 选项 | 简写 | 说明 |
|------|------|------|
| `--package-manager` | `-p` | 指定包管理器 (npm/yarn/pnpm) |
| `--skip-install` | `-s` | 跳过依赖安装 |
| `--skip-git` | `-g` | 跳过 Git 初始化 |
| `--strict` | | 启用 TypeScript 严格模式 |
| `--language` | `-l` | 指定语言 (typescript/javascript) |
| `--collection` | `-c` | 指定 schematics 集合 |
| `--dry-run` | `-d` | 预览将要创建的文件，不实际创建 |

## 生成资源 (generate)

`nest generate` 是最常用的命令，用于生成各种 NestJS 构建块。

### 基本语法

```bash
nest generate <schematic> <name> [options]
# 简写
nest g <schematic> <name> [options]
```

### 生成模块 (Module)

```bash
# 基本生成
nest g module users

# 生成到指定目录
nest g module modules/users

# 预览 (不实际创建)
nest g module users --dry-run
```

生成结果：
```
src/
└── users/
    └── users.module.ts
```

### 生成控制器 (Controller)

```bash
# 基本生成
nest g controller users

# 不生成测试文件
nest g controller users --no-spec

# 指定路径
nest g controller modules/users

# 扁平化 (不创建目录)
nest g controller users --flat
```

生成结果：
```
src/
└── users/
    ├── users.controller.ts
    └── users.controller.spec.ts  # 测试文件
```

### 生成服务 (Service)

```bash
# 基本生成
nest g service users

# 不生成测试文件
nest g service users --no-spec
```

### 生成完整资源 (Resource) ⭐ 推荐

`resource` 命令一次性生成完整的 CRUD 模块，包括：
- Module
- Controller
- Service
- DTO 文件
- Entity 文件

```bash
nest g resource users
```

执行后会提示选择传输层：
```
? What transport layer do you use? (Use arrow keys)
❯ REST API
  GraphQL (code first)
  GraphQL (schema first)
  Microservice (non-HTTP)
  WebSockets
```

然后询问是否生成 CRUD 入口点：
```
? Would you like to generate CRUD entry points? (Y/n)
```

生成结果：
```
src/
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    ├── users.controller.spec.ts
    ├── users.service.ts
    ├── users.service.spec.ts
    ├── dto/
    │   ├── create-user.dto.ts
    │   └── update-user.dto.ts
    └── entities/
        └── user.entity.ts
```

### 其他可生成的 Schematic

```bash
# 生成守卫
nest g guard auth
nest g guard guards/auth

# 生成中间件
nest g middleware logger
nest g mi logger  # 简写

# 生成拦截器
nest g interceptor transform
nest g itc transform  # 简写

# 生成管道
nest g pipe validation
nest g pi validation  # 简写

# 生成过滤器 (异常过滤器)
nest g filter http-exception
nest g f http-exception  # 简写

# 生成装饰器
nest g decorator roles
nest g d roles  # 简写

# 生成网关 (WebSocket)
nest g gateway events

# 生成类
nest g class users/user.entity
nest g cl users/user.entity  # 简写

# 生成接口
nest g interface users/user
nest g itf users/user  # 简写

# 生成枚举
nest g enum users/user-role

# 生成库 (Monorepo)
nest g library shared
nest g lib shared  # 简写

# 生成子应用 (Monorepo)
nest g application admin
nest g app admin  # 简写
```

### Schematic 简写对照表

| Schematic | 简写 | 说明 |
|-----------|------|------|
| `module` | `mo` | 模块 |
| `controller` | `co` | 控制器 |
| `service` | `s` | 服务 |
| `resource` | `res` | 完整 CRUD 资源 |
| `guard` | `gu` | 守卫 |
| `middleware` | `mi` | 中间件 |
| `interceptor` | `itc` | 拦截器 |
| `pipe` | `pi` | 管道 |
| `filter` | `f` | 过滤器 |
| `decorator` | `d` | 装饰器 |
| `gateway` | `ga` | 网关 |
| `class` | `cl` | 类 |
| `interface` | `itf` | 接口 |
| `library` | `lib` | 库 |
| `application` | `app` | 子应用 |

### 生成选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--dry-run` | `-d` | 预览，不实际创建 |
| `--project` | `-p` | 指定项目 (Monorepo) |
| `--flat` | | 不创建子目录 |
| `--no-spec` | | 不生成测试文件 |
| `--skip-import` | | 不自动导入到模块 |

## 构建与运行

### 开发模式

```bash
# 启动开发服务器 (热重载)
nest start --watch
# 或
nest start -w

# 使用 package.json 脚本
npm run start:dev
```

### 调试模式

```bash
# 启动调试模式
nest start --debug
# 或
nest start --debug --watch

# 指定调试端口
nest start --debug=9229

# 使用 package.json 脚本
npm run start:debug
```

### 生产构建

```bash
# 构建项目
nest build

# 监听模式构建
nest build --watch

# 使用 webpack 构建
nest build --webpack

# 构建后运行
npm run start:prod
```

### 构建选项

| 选项 | 说明 |
|------|------|
| `--watch` | 监听文件变化 |
| `--webpack` | 使用 webpack 打包 |
| `--webpackPath` | 指定 webpack 配置路径 |
| `--tsc` | 使用 tsc 编译 (默认) |
| `--config` | 指定 nest-cli.json 路径 |
| `--path` | 指定 tsconfig 路径 |

## 信息命令

```bash
# 查看项目信息
nest info
```

输出示例：
```
 _   _             _      ___  _____  _____  _     _____
| \ | |           | |    |_  |/  ___|/  __ \| |   |_   _|
|  \| |  ___  ___ | |_     | |\ `--. | /  \/| |     | |
| . ` | / _ \/ __|| __|    | | `--. \| |    | |     | |
| |\  ||  __/\__ \| |_ /\__/ //\__/ /| \__/\| |_____| |_
\_| \_/ \___||___/ \__|\____/ \____/  \____/\_____/\___/

[System Information]
OS Version     : Windows 10
NodeJS Version : v18.17.0
NPM Version    : 9.6.7
[Nest CLI]
Nest CLI Version : 10.2.1
[Nest Platform Information]
platform-express version : 10.2.10
schematics version       : 10.0.3
testing version          : 10.2.10
common version           : 10.2.10
core version             : 10.2.10
cli version              : 10.2.1
```

## nest-cli.json 配置

项目根目录的 `nest-cli.json` 用于配置 CLI 行为。

### 基本配置

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": false,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

### 完整配置示例

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "entryFile": "main",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": false,
    "tsConfigPath": "tsconfig.build.json",
    "assets": [
      "**/*.graphql",
      {
        "include": "templates/**/*",
        "outDir": "dist/templates",
        "watchAssets": true
      }
    ],
    "watchAssets": true
  },
  "generateOptions": {
    "spec": false,
    "flat": false
  }
}
```

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `collection` | 使用的 schematics 集合 |
| `sourceRoot` | 源码目录 |
| `entryFile` | 入口文件名 (不含扩展名) |
| `compilerOptions.deleteOutDir` | 构建前删除输出目录 |
| `compilerOptions.webpack` | 是否使用 webpack |
| `compilerOptions.assets` | 需要复制的静态资源 |
| `compilerOptions.watchAssets` | 监听静态资源变化 |
| `generateOptions.spec` | 默认是否生成测试文件 |
| `generateOptions.flat` | 默认是否扁平化生成 |

### 禁用默认生成测试文件

```json
{
  "generateOptions": {
    "spec": false
  }
}
```

### 资源复制配置

```json
{
  "compilerOptions": {
    "assets": [
      "**/*.graphql",
      "config/**/*.yaml",
      {
        "include": "templates/**/*",
        "outDir": "dist/templates",
        "watchAssets": true
      }
    ]
  }
}
```

## Monorepo 模式

NestJS 支持 Monorepo 模式，在一个仓库中管理多个项目。

### 转换为 Monorepo

```bash
# 添加子应用
nest g app admin

# 添加共享库
nest g lib shared
```

转换后的结构：
```
root/
├── apps/
│   ├── my-app/           # 主应用
│   │   └── src/
│   └── admin/            # 子应用
│       └── src/
├── libs/
│   └── shared/           # 共享库
│       └── src/
├── nest-cli.json
└── tsconfig.json
```

### Monorepo nest-cli.json

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/my-app/src",
  "monorepo": true,
  "root": "apps/my-app",
  "compilerOptions": {
    "webpack": true,
    "tsConfigPath": "apps/my-app/tsconfig.app.json"
  },
  "projects": {
    "my-app": {
      "type": "application",
      "root": "apps/my-app",
      "entryFile": "main",
      "sourceRoot": "apps/my-app/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-app/tsconfig.app.json"
      }
    },
    "admin": {
      "type": "application",
      "root": "apps/admin",
      "entryFile": "main",
      "sourceRoot": "apps/admin/src",
      "compilerOptions": {
        "tsConfigPath": "apps/admin/tsconfig.app.json"
      }
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "entryFile": "index",
      "sourceRoot": "libs/shared/src",
      "compilerOptions": {
        "tsConfigPath": "libs/shared/tsconfig.lib.json"
      }
    }
  }
}
```

### Monorepo 常用命令

```bash
# 启动指定项目
nest start my-app
nest start admin

# 构建指定项目
nest build my-app
nest build admin
nest build shared

# 在指定项目中生成资源
nest g module users --project admin
nest g service auth --project shared

# 构建所有项目
nest build --all
```

## 添加外部库

### 安装官方包

```bash
# 添加 Swagger
nest add @nestjs/swagger

# 添加 GraphQL
nest add @nestjs/graphql
```

`nest add` 会自动：
1. 安装依赖
2. 执行初始化脚本
3. 更新必要的配置文件

## 常用命令速查

```bash
# 创建项目
nest new my-app
nest new my-app -p pnpm --strict

# 生成资源
nest g resource users        # 完整 CRUD
nest g mo users              # 模块
nest g co users              # 控制器
nest g s users               # 服务
nest g gu auth               # 守卫
nest g mi logger             # 中间件
nest g pi validation         # 管道
nest g f http-exception      # 过滤器
nest g itc transform         # 拦截器
nest g d roles               # 装饰器

# 运行
nest start                   # 启动
nest start -w                # 热重载
nest start --debug -w        # 调试模式

# 构建
nest build                   # 构建
nest build --webpack         # webpack 构建

# 信息
nest info                    # 查看项目信息
nest --help                  # 帮助
nest g --help                # 生成命令帮助
```

## 实用技巧

### 1. 批量生成模块

```bash
# 创建用户模块完整结构
nest g resource users
nest g guard users/guards/user-owner
nest g interceptor users/interceptors/user-serialize
```

### 2. 预览生成结果

```bash
# 使用 --dry-run 预览
nest g resource products --dry-run
```

### 3. 自定义生成模板

可以通过创建自定义 schematics 来定制生成模板，但这需要更高级的配置。

### 4. 快速创建 API 项目

```bash
# 一键创建完整 API 项目结构
nest new my-api -p pnpm --strict
cd my-api
nest g resource users
nest g resource products
nest g resource orders
nest g guard common/guards/auth
nest g filter common/filters/http-exception
nest g interceptor common/interceptors/transform
nest g pipe common/pipes/validation
```

## 下一步

[👉 01. NestJS 简介与核心概念](./01-introduction.md)

