# 快速开始

## 安装

```bash
npm install -g @freelog/cli
```

---

## 5分钟上手

### 1. 登录
```bash
freelog-cli login -g
```

### 2. 初始化项目
```bash
freelog-cli init my-project
cd my-project
```

### 3. 添加依赖
```bash
# 交互式选择版本
freelog-cli add my-resource -sv
```

### 4. 发布作品
```bash
freelog-cli publish
```

---

## 开发环境配置

### 本地开发
```bash
# 克隆项目
git clone <repo>
cd cli-project

# 安装依赖
npm install

# 测试命令
node bin/index.js --help
```

### 环境变量
```bash
# 测试环境
export FREELOG_ENV=development

# 生产环境（默认）
export FREELOG_ENV=production
```

---

## 常用命令

```bash
# 认证
freelog-cli login [-g]          # 登录
freelog-cli status              # 查看状态

# 依赖管理
freelog-cli add <res> -sv       # 添加（选择版本）
freelog-cli update <res> -sv    # 更新
freelog-cli dep list            # 列表

# 发布
freelog-cli publish [-d]        # 发布
```

---

## 下一步

- 📖 [中文使用手册](../zh-CN/USER_GUIDE.md) - 完整功能说明
- 📦 [依赖管理](../features/DEPENDENCY.md) - 详细用法
- 🎯 [版本选择](../features/VERSION_SELECTOR.md) - 交互选择
