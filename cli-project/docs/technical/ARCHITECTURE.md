# 项目架构

## 目录结构

```
cli-project/
├── bin/
│   └── index.js              # CLI 入口
├── src/
│   ├── index.js              # 命令注册
│   ├── commands/             # 命令实现
│   │   ├── auth/            # 认证命令
│   │   ├── dependency/      # 依赖命令
│   │   ├── init/            # 初始化
│   │   ├── publish/         # 发布
│   │   ├── sync/            # 同步
│   │   └── analyze/         # 分析
│   ├── core/                 # 核心模块
│   │   ├── api.js           # API 封装
│   │   ├── auth.js          # 认证管理
│   │   ├── config.js        # 配置管理
│   │   └── logger.js        # 日志记录
│   ├── utils/                # 工具函数
│   │   ├── crypto.js        # 加密工具
│   │   ├── spinner.js       # 加载动画
│   │   ├── output.js        # 输出格式
│   │   ├── validator.js     # 输入验证
│   │   └── version-selector.js  # 版本选择
│   └── constants/            # 常量配置
│       ├── config.js        # 配置常量
│       └── errors.js        # 错误定义
└── docs/                     # 文档
```

---

## 核心模块

### API 模块 (`core/api.js`)
- Axios 封装
- 统一错误处理
- Token 自动注入
- 响应数据提取

### 认证模块 (`core/auth.js`)
- Token 加密存储
- 全局/工作空间登录
- Token 过期检查
- 自动解密

### 配置模块 (`core/config.js`)
- `freelog.json` 读写
- 配置验证
- 默认值处理

---

## 技术栈

- **Node.js**: >=16.0.0
- **Commander**: 命令行解析
- **Inquirer**: 交互式输入
- **Axios**: HTTP 请求
- **Chalk**: 终端颜色
- **Ora**: 加载动画

---

## 扩展开发

### 添加新命令

1. 在 `src/commands/` 创建命令文件
2. 在 `src/index.js` 注册命令
3. 添加文档说明

### 添加新 API

1. 在 `src/core/api.js` 添加函数
2. 导出新函数
3. 在命令中使用
