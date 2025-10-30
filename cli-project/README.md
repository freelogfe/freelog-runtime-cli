# Freelog CLI

> 专业的 Freelog 作品开发与发布工具

## 安装

```bash
npm install -g @freelog/cli
```

## 快速开始

```bash
# 初始化项目
freelog-cli init my-project

# 登录
freelog-cli login -g

# 发布作品
freelog-cli publish

# 添加依赖
freelog-cli add resource-id@1.0.0
```

## 目录结构

```
cli-project/
├── bin/                    # 可执行文件入口
├── src/
│   ├── commands/          # 命令实现
│   │   ├── auth/         # 认证相关命令
│   │   ├── publish/      # 发布相关命令
│   │   ├── dependency/   # 依赖管理命令
│   │   ├── sync/         # 信息同步命令
│   │   ├── analyze/      # 文件分析命令
│   │   └── init/         # 项目初始化命令
│   ├── core/             # 核心功能
│   │   ├── auth.js       # 认证管理
│   │   ├── config.js     # 配置管理
│   │   ├── api.js        # API 请求
│   │   └── logger.js     # 日志系统
│   ├── utils/            # 工具函数
│   │   ├── file.js       # 文件操作
│   │   ├── validator.js  # 验证器
│   │   ├── version.js    # 版本管理
│   │   └── spinner.js    # 加载动画
│   ├── constants/        # 常量定义
│   │   ├── errors.js     # 错误代码
│   │   └── config.js     # 默认配置
│   └── index.js          # 主入口
└── package.json
```

## 📚 文档

完整文档请查看 [文档中心](./docs/README.md)

### 快速链接

- 📖 [快速开始](./docs/guide/QUICK_START.md) - 5分钟快速上手
- 🔐 [认证指南](./docs/guide/AUTHENTICATION_GUIDE.md) - 登录和Token管理
- 🛠️ [开发指南](./docs/guide/DEVELOPMENT.md) - 开发环境配置
- 🏗️ [项目架构](./docs/technical/ARCHITECTURE.md) - 技术架构说明
- 📝 [更新说明](./docs/zh-CN/更新说明.md) - 最新功能介绍（中文）
- 🌍 [环境配置](./docs/zh-CN/环境配置与同步命令说明.md) - 环境切换说明（中文）

### 所有文档

查看 [docs/](./docs/) 目录获取完整文档列表。

## 主要功能

- ✅ **认证管理**: 支持全局/工作空间登录，Token加密存储
- ✅ **项目初始化**: 多种模板，快速创建项目
- ✅ **发布管理**: 草稿/正式发布，自动版本管理
- ✅ **依赖管理**: 添加、删除、列表、同步依赖
- ✅ **信息同步**: 从线上同步资源信息
- ✅ **文件分析**: 自动分析项目属性
- ✅ **环境切换**: 支持测试/生产环境

## License

MIT

