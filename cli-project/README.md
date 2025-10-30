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

## 文档

详见 [脚手架设计文档](../脚手架设计.md)

## License

MIT

