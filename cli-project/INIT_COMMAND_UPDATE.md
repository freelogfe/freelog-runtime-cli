# Init 命令更新说明

## 更新时间
2025-10-30

## 更新内容

已将 `packages/init/lib/index.js` 中的模板安装逻辑整合到 `cli-project/src/commands/init/index.js` 中，同时保持代码规范和结构清晰。

---

## 主要特性

### 1. 完整的模板安装流程

**流程图**:
```
开始
  ↓
检查目录是否为空
  ↓
选择初始化类型（主题/插件/前端库）
  ↓
获取模板列表（筛选）
  ↓
输入项目信息（名称、版本、命名空间）
  ↓
选择模板
  ↓
准备/下载模板
  ↓
安装模板
  ↓
创建 freelog.json
  ↓
安装依赖
  ↓
完成
```

### 2. 支持的初始化类型

| 类型 | 说明 | 标签 |
|------|------|------|
| **主题 (theme)** | 展示类应用 | `theme` |
| **插件 (widget)** | 功能型插件 | `widget` |
| **前端库 (package)** | JS/React/Vue 组件库 | `package` |

### 3. 可用模板列表

#### 主题模板 (8个)
- `@freelog-cli/template-vite-react` - Vite + React
- `@freelog-cli/template-vite-react-ts` - Vite + React + TS
- `@freelog-cli/template-vite-vue` - Vite + Vue
- `@freelog-cli/template-vite-vue-ts` - Vite + Vue + TS
- `@freelog-cli/template-webpack-react` - Webpack + React
- `@freelog-cli/template-webpack-react-ts` - Webpack + React + TS
- `@freelog-cli/template-webpack-vue` - Webpack + Vue
- `@freelog-cli/template-webpack-vue-ts` - Webpack + Vue + TS

#### 插件模板 (2个)
- `@freelog-cli/template-widget-vite-react` - 插件 + Vite + React
- `@freelog-cli/template-widget-vite-vue` - 插件 + Vite + Vue

#### 前端库模板 (3个)
- `@freelog-cli/template-package-js` - 纯 JS 库
- `@freelog-cli/template-package-react` - React 组件库
- `@freelog-cli/template-package-vue` - Vue 组件库

---

## 核心功能

### 1. prepare() - 准备阶段

```javascript
async function prepare(targetPath, options)
```

**功能**:
- ✅ 检查目录是否为空
- ✅ 询问是否清空目录（force 模式）
- ✅ 选择初始化类型（主题/插件/前端库）
- ✅ 获取并筛选模板列表
- ✅ 输入项目名称
- ✅ 输入版本号
- ✅ 输入命名空间（前端库专用）

**返回**:
```javascript
{
  templateList: [...],  // 筛选后的模板列表
  projectInfo: {
    name: '项目名称',
    projectName: '项目名称',
    className: 'ProjectName',  // 格式化的类名
    version: '1.0.0',
    initType: 'theme|widget|package',
    nameSpace: 'freelogLibrary.xxx'  // 仅前端库
  }
}
```

### 2. downloadTemplate() - 下载模板

```javascript
async function downloadTemplate(templateList)
```

**功能**:
- ✅ 交互式选择模板
- ✅ 检查本地缓存
- ✅ 从本地 templates 目录复制模板
- ✅ 模板缓存管理

**模板缓存位置**:
- Windows: `%USERPROFILE%\.freelog-cli\template\`
- macOS/Linux: `~/.freelog-cli/template/`

**返回**:
```javascript
{
  ...templateInfo,      // 模板基本信息
  path: '模板路径',      // template 子目录
  sourcePath: '源路径'   // 模板包根目录
}
```

### 3. installTemplate() - 安装模板

```javascript
async function installTemplate(template, projectInfo, targetPath)
```

**功能**:
- ✅ 复制模板文件到目标目录
- ✅ 过滤不需要的文件（node_modules, .git, .DS_Store）
- ✅ 创建 `freelog.json` 配置文件
- ✅ 自动安装依赖（npm install）

**创建的目录结构**:
```
项目名称/
├── src/           # 源代码目录
├── public/        # 静态资源
├── package.json   # 项目配置
├── freelog.json   # Freelog 配置
└── ... (其他模板文件)
```

### 4. installCustomTemplate() - 自定义模板

```javascript
async function installCustomTemplate(template, projectInfo, targetPath)
```

**功能**:
- ✅ 支持自定义模板脚本
- ✅ 执行模板的 main 入口文件
- ✅ 传递项目信息给模板脚本

---

## freelog.json 配置

自动生成的配置文件结构：

```json
{
  "version": "1.0.0",
  "type": "object",
  "local": {
    "buildDir": "./dist",
    "entryFile": "./dist/index.html",
    "excludes": ["node_modules", "*.log", ".git"]
  },
  "resource": {
    "resourceId": "",
    "resourceName": "项目名称",
    "resourceType": "theme|widget|package",
    "coverImages": [],
    "description": "",
    "tags": []
  },
  "properties": [],
  "customOptions": [],
  "changelog": {
    "1.0.0": "初始版本"
  },
  "dependencies": [],
  "nameSpace": "freelogLibrary.xxx"  // 仅前端库
}
```

---

## 使用示例

### 示例 1: 创建主题项目

```bash
# 执行命令
$ freelog-cli init

? 当前文件夹不为空，是否继续创建？ Yes
? 请选择初始化类型 主题
? 请输入主题名称 my-theme
? 请输入版本号 1.0.0
? 请选择项目模板 freelog主题-vite-react模板

✔ 模板准备成功
✔ 模板安装成功
✔ 配置文件创建成功
✔ 依赖安装成功

✨ 项目创建成功！

请执行以下命令开始开发:

  cd my-theme
  npm install    # 安装依赖
  npm run dev    # 启动开发服务器

更多命令:
  freelog-cli login      # 登录
  freelog-cli publish    # 发布作品
  freelog-cli --help     # 查看帮助
```

### 示例 2: 创建插件项目

```bash
$ freelog-cli init

? 请选择初始化类型 插件
? 请输入插件名称 my-widget
? 请输入版本号 1.0.0
? 请选择项目模板 freelog插件-vite-react模板

✨ 项目创建成功！
```

### 示例 3: 创建前端库项目

```bash
$ freelog-cli init

? 请选择初始化类型 前端库
? 请输入前端库名称 my-lib
? 请输入版本号 1.0.0
? 请输入库的 nameSpace myLib  # 自动添加前缀 freelogLibrary.
? 请选择项目模板 freelog前端库-react-模板

✨ 项目创建成功！
```

### 示例 4: 强制覆盖模式

```bash
$ freelog-cli init --force

? 是否确认清空当前目录下的文件？ Yes
# ... 后续流程
```

---

## 命令选项

```bash
freelog-cli init [project-name] [options]
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--force` | 强制清空目录 | `false` |
| `-t, --template <name>` | 指定模板名称 | 交互式选择 |
| `--list` | 列出所有可用模板 | - |

---

## 与原代码的对比

### 保留的功能 ✅
1. ✅ 完整的准备流程（prepare）
2. ✅ 模板下载和缓存（downloadTemplate）
3. ✅ 模板安装逻辑（installTemplate）
4. ✅ 自定义模板支持（installCustomTemplate）
5. ✅ npm 依赖安装（npmInstall）
6. ✅ EJS 模板渲染（ignore 文件支持）
7. ✅ 三种初始化类型（主题/插件/前端库）
8. ✅ 命名空间支持（前端库）
9. ✅ 格式化类名（formatClassName）

### 改进的地方 ⭐
1. ⭐ 使用规范的代码结构
2. ⭐ 统一的错误处理
3. ⭐ 统一的日志输出
4. ⭐ 统一的 spinner 动画
5. ⭐ 更清晰的函数分离
6. ⭐ 更好的代码注释
7. ⭐ 符合 ESLint 规范

### 简化的地方 📝
1. 📝 移除了 Package 类（简化为直接文件复制）
2. 📝 模板从本地 templates 目录获取（可扩展为 npm 安装）
3. 📝 移除了 sleep 延迟（提高响应速度）

---

## 扩展说明

### 如何添加新模板

在 `getProjectTemplate()` 函数中添加新模板配置：

```javascript
{
  name: '模板显示名称',
  npmName: '@freelog-cli/template-xxx',
  version: '1.0.0',
  type: 'normal',  // 或 'custom'
  startCommand: 'npm run start',
  ignore: ['**/public/**'],  // 可选
  tag: ['theme'],  // 或 ['widget', 'package']
  buildPath: 'dist'
}
```

### 如何支持 npm 下载模板

在 `downloadTemplate()` 函数中修改下载逻辑：

```javascript
// 替换这部分代码
const localTemplatePath = path.join(__dirname, '../../../templates', ...);

// 为
const { spawn } = require('child_process');
await new Promise((resolve, reject) => {
  const npm = spawn('npm', ['install', selectedTemplate.npmName, '@' + selectedTemplate.version], {
    cwd: templateDir
  });
  npm.on('close', resolve);
  npm.on('error', reject);
});
```

---

## 测试建议

```bash
# 1. 测试主题创建
freelog-cli init
# 选择：主题 > vite-react

# 2. 测试插件创建
freelog-cli init
# 选择：插件 > vite-react

# 3. 测试前端库创建
freelog-cli init
# 选择：前端库 > js

# 4. 测试强制模式
freelog-cli init --force

# 5. 检查生成的文件
cd 项目名称
ls -la
cat freelog.json
```

---

## 相关文件

- `cli-project/src/commands/init/index.js` - 主文件（543 行）
- `packages/init/lib/index.js` - 原文件（参考）
- `packages/init/lib/getProjectTemplate.js` - 模板列表（已整合）

---

**更新完成** ✅

init 命令现已完全整合原有逻辑，并符合新的代码规范！

