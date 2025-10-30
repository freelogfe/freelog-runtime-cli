# 快速开始指南

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd cli-project

# 安装依赖
npm install

# 链接到全局（用于本地开发测试）
npm link
```

## 基本使用

### 1. 查看帮助

```bash
freelog-cli --help
```

### 2. 初始化项目

```bash
# 交互式创建
freelog-cli init

# 指定项目名称
freelog-cli init my-project

# 使用指定模板
freelog-cli init my-project -t vite-react

# 查看所有可用模板
freelog-cli init --list
```

### 3. 登录

```bash
# 全局登录（推荐个人开发者）
freelog-cli login -g

# 工作空间登录（推荐团队协作）
freelog-cli login

# 直接传参登录
freelog-cli login -u myuser -p mypassword -g

# 查看登录状态
freelog-cli status
```

### 4. 同步配置

```bash
# 从线上同步作品信息（初始化配置）
freelog-cli sync resource-id@latest

# 同步所有信息
freelog-cli sync -a

# 交互式选择同步内容
freelog-cli sync
```

### 5. 开发

```bash
# 在项目目录下开发
npm run dev

# 构建
npm run build
```

### 6. 发布

```bash
# 基本发布（交互式）
freelog-cli publish

# 自动递增补丁版本号
freelog-cli publish --patch -m "修复登录问题"

# 发布为草稿
freelog-cli publish -d

# 使用全局用户发布
freelog-cli publish -gu
```

## 依赖管理

### 添加依赖

```bash
# 添加最新版本
freelog-cli add resource-id

# 添加指定版本
freelog-cli add resource-id@1.0.0

# 通过 URL 添加
freelog-cli add https://freelog.com/resource/12345@2.1.0
```

### 查看依赖

```bash
# 查看本地依赖
freelog-cli dep list

# 查看线上依赖
freelog-cli dep list -v latest --remote --auth
```

### 删除依赖

```bash
# 删除单个依赖
freelog-cli remove resource-id

# 批量删除
freelog-cli remove res-1 res-2 res-3
```

## 文件分析

```bash
# 分析当前项目构建目录
freelog-cli analyze

# 分析指定文件/目录
freelog-cli analyze -f ./dist

# 输出分析结果到文件
freelog-cli analyze -f ./dist -o analysis.json

# 以表格形式显示
freelog-cli analyze --format table
```

## 登出

```bash
# 工作空间登出
freelog-cli logout

# 全局登出
freelog-cli logout -g
```

## 常见工作流

### 场景1：创建新项目并发布

```bash
# 1. 创建项目
freelog-cli init my-app -t vite-react
cd my-app

# 2. 安装依赖
npm install

# 3. 开发
npm run dev

# 4. 登录
freelog-cli login -g

# 5. 构建
npm run build

# 6. 发布
freelog-cli publish --patch -m "初始版本"
```

### 场景2：基于现有作品开发

```bash
# 1. 创建项目目录
mkdir my-project
cd my-project

# 2. 登录
freelog-cli login -g

# 3. 同步线上作品配置
freelog-cli sync resource-id@latest

# 4. 开发
# ... 修改代码 ...

# 5. 构建
npm run build

# 6. 发布新版本
freelog-cli publish --minor -m "添加新功能"
```

### 场景3：管理依赖

```bash
# 1. 查看当前依赖
freelog-cli dep list

# 2. 添加新依赖
freelog-cli add ui-library@2.0.0

# 3. 删除不需要的依赖
freelog-cli remove old-dependency

# 4. 同步线上依赖（如果需要）
freelog-cli sync --all
```

## 配置文件 (freelog.json)

项目根目录的 `freelog.json` 是核心配置文件：

```json
{
  "version": "1.0.0",
  "local": {
    "buildDir": "./dist",
    "entryFile": "./dist/index.html",
    "excludes": ["node_modules", "*.log"]
  },
  "resource": {
    "resourceId": "",
    "resourceName": "my-app",
    "resourceType": "widget",
    "description": "我的应用",
    "tags": ["react", "vite"]
  },
  "properties": [],
  "customOptions": [],
  "changelog": {
    "1.0.0": "初始版本"
  },
  "dependencies": []
}
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# API 地址
FREELOG_API_URL=https://api.freelog.com

# 日志级别
LOG_LEVEL=info

# 调试模式
DEBUG=false
```

## 故障排查

### 问题1：命令未找到

```bash
# 确保已全局安装或链接
npm link

# 或者直接运行
node bin/index.js --help
```

### 问题2：登录失败

```bash
# 检查用户名和密码
freelog-cli login -u your-username -p your-password

# 查看详细日志
DEBUG=true freelog-cli login
```

### 问题3：配置文件不存在

```bash
# 先同步配置
freelog-cli sync resource-id

# 或手动创建
# 编辑 freelog.json
```

### 问题4：查看日志

```bash
# Windows
type %USERPROFILE%\.freelog-cli\logs\combined.log

# macOS/Linux
cat ~/.freelog-cli/logs/combined.log
```

## 获取帮助

```bash
# 全局帮助
freelog-cli --help

# 特定命令帮助
freelog-cli login --help
freelog-cli publish --help
freelog-cli add --help
```

## 更多资源

- 📖 [完整文档](../脚手架设计.md)
- 🔧 [开发文档](./DEVELOPMENT.md)
- 📋 [项目总结](./PROJECT_SUMMARY.md)
- 🌐 [Freelog 平台](https://freelog.com)

---

祝你使用愉快！ 🎉

