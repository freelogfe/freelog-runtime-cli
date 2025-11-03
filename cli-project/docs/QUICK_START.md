# 快速开始

## 安装

```bash
npm install -g @freelog/cli
```

---

## 5分钟上手

### 1. 登录认证

```bash
# 全局登录（推荐）
freelog-cli login -g

# 工作空间登录
freelog-cli login

# 查看登录状态
freelog-cli status
```

**认证特性**:
- ✅ Token 自动加密存储
- ✅ 支持全局和工作空间两种模式
- ✅ Token 自动续期

---

### 2. 初始化项目

```bash
freelog-cli init my-project
cd my-project
```

**支持模板**:
- 📦 package-js/vue/react - 组件包
- 🎨 vite-vue/react - Vite 项目
- ⚙️ webpack-vue/react - Webpack 项目

---

### 3. 添加依赖

```bash
# 默认添加最新版本
freelog-cli add my-resource

# 交互式选择版本
freelog-cli add my-resource -sv

# 添加特定版本
freelog-cli add my-resource@1.0.0
```

---

### 4. 发布作品

```bash
# 发布为草稿
freelog-cli publish -d

# 正式发布
freelog-cli publish
```

---

## 开发环境

### 本地开发

```bash
# 克隆并安装
git clone <repo>
cd cli-project
npm install

# 测试命令
node bin/index.js --help
```

### 环境切换

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
freelog-cli logout [-g]         # 登出
freelog-cli status              # 状态

# 初始化
freelog-cli init [name]         # 创建项目

# 依赖管理（支持 -sv 选择版本）
freelog-cli add <res> [-sv]     # 添加
freelog-cli change <res> [-sv]  # 修改
freelog-cli update <res> [-sv]  # 更新
freelog-cli remove <res>        # 删除
freelog-cli dep list            # 列表

# 发布
freelog-cli publish [-d]        # 发布
freelog-cli sync                # 同步

# 分析
freelog-cli analyze             # 文件分析
```

---

## 下一步

- 📦 [依赖管理详解](./DEPENDENCY.md)
- 🔧 [项目架构](./ARCHITECTURE.md)
- 🇨🇳 [中文手册](./zh-CN/USER_GUIDE.md)

