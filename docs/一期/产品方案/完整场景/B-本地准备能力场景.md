# B 组：本地准备能力场景（8 个深度场景）

> **目标**: 验证 CLI 在本地内容准备方面的能力，包括模板创建、构建、压缩等
> 
> **对齐原则**: Console UI 无本地概念 vs CLI 的本地优先设计

---

## B01 - 从模板创建主题工程（独立命令）

**用户画像**: 新手开发者，想快速开始一个 React 主题项目

```bash
$ freelog template create theme react my-new-theme

📦 模板选择器

可用主题模板:
  [1] React Theme Starter (推荐)
      • 支持热更新
      • TypeScript
      • Webpack 构建
      
  [2] Vue Theme Starter
      • Vue 3 + Composition API
      • Vite 构建
      
  [3] Vanilla JS Theme
      • 原生 JavaScript
      • Rollup 构建

请选择模板 [1-3]: 1

📁 项目初始化
  项目名：my-new-theme
  路径：./my-new-theme
  包管理器：npm | pnpm | yarn
  
请选择包管理器 [回车使用 npm]: pnpm

↓ 下载模板...
✓ 模板文件解压完成
  
📋 生成的项目结构:
  my-new-theme/
  ├── src/
  │   ├── components/
  │   ├── hooks/
  │   ├── utils/
  │   ├── index.html
  │   └── main.js
  ├── public/
  │   └── assets/
  ├── package.json
  ├── webpack.config.js
  ├── .freelog-template.json  ← 模板元数据
  └── README.md

✨ 模板元数据显示:
  模板 ID: theme-react-starter
  版本：1.2.0
  创建时间：2026-09-02
  
💡 后续步骤:
  1. cd my-new-theme
  2. pnpm install
  3. pnpm dev       # 启动开发服务器
  4. pnpm build     # 构建生产版本
  5. freelog publish ./dist/  # 发布到 Freelog

🎉 项目创建成功！
```

---

## B02 - 从模板创建插件工程

```bash
$ freelog template create plugin functional my-plugin

📦 模板选择器

可用插件模板:
  [1] 功能插件模板 (推荐)
      • 标准插件入口
      • 依赖管理示例
      
  [2] UI 组件插件
      • 可插拔 UI 组件
      
请选择模板 [1-2]: 1

✅ 插件工程创建成功
  
💡 提示：
  插件资源需要先在平台注册
  发布后可供其他主题依赖使用
```

---

## B03 - 独立压缩目录生成 artifact

**用户画像**: 想先打包检查，再决定是否上传

```bash
$ freelog pack ./src/theme --output dist/theme.zip

📁 目录扫描
  路径：./src/theme/
  找到文件：12 个
  总计大小：2.8 MB

⚙️ 应用忽略规则
  ✓ .gitignore
  ✓ node_modules/
  ✓ *.log
  
📦 压缩包创建
  输出：./dist/theme.zip
  压缩后大小：1.5 MB
  SHA1: a1b2c3d4e5f6...
  
  文件清单:
    index.html
    main.js
    style.css
    assets/logo.png
    ... (共 12 个文件)

✅ 压缩完成！

📊 报告:
  原大小：2.8 MB
  压缩后：1.5 MB
  压缩率：46%
  
💡 此 artifact 可直接用于发布：
  $ freelog publish ./dist/theme.zip
```

### 异常分支 B03-1: 文件过大警告

```bash
$ freelog pack ./large-dir --output output.zip

📁 目录扫描
  总计大小：150 MB
  
⚠️ 文件大小警告

检测到目录大小超过 100MB
Freelog 单资源上限为 50MB

建议操作:
  A) 拆分目录后分别压缩
  B) 排除不必要的大文件
  C) 仍要压缩（可能发布失败）

您选择：[A]

请指定排除模式（每行一个）:
  > **/*.log
  > **/*.tmp
  > docs/
  
重新扫描...
新大小：45 MB
✅ 安全范围内
```

---

## B04 - publish 流程内自动触发构建

```bash
$ cd my-react-theme/
$ freelog publish ./src/

🏗️ 检测到未构建的源代码
  源目录：./src/
  未检测到 dist/目录
  
是否自动执行构建？[Y/n]: Y

✅ 检测到 package.json
  scripts.build: "webpack --mode production"
  
正在执行构建...
$ npm run build
  
asset main.js 50 KiB [emitted] [minimized]
assets by path *.html 1 KiB
modules by path ./src/ 50 KiB

✅ 构建成功！
产物位置：./dist/
总大小：150 KiB

[继续发布流程] → 压缩上传...
```

---

## B05 - .gitignore 与自定义 ignore 优先级

**场景**: 测试不同 ignore 文件的优先级规则

```bash
$ cat .gitignore
node_modules/
.env
*.log

$ cat .freelignore
dist/
build/
.DS_Store

$ freelog pack ./src --verbose

📁 扫描目录
  应用忽略规则顺序:
    1. .freelignore (自定义，优先)
       ✓ 排除：dist/, build/, .DS_Store
    2. .gitignore (通用)
       ✓ 排除：node_modules/, .env, *.log
    
  最终纳入的文件:
    ✓ src/components/
    ✓ src/hooks/
    ✓ src/utils/
    
💡 说明：.freelignore 优先级高于.gitignore
  可在.freelignore 中添加特定排除规则
```

---

## B06 - 压缩包 SHA1 校验与断点续传

**场景**: 大文件上传中途断网后的恢复

```bash
$ freelog publish ./dist/large-file.zip

📁 文件扫描
  大小：45 MB
  SHA1: abc123def456...

📦 压缩并上传中
  [████░░░░░░] 30% 已上传 13.5 MB
  
⚠️ 网络连接中断
  
💾 自动保存进度:
  已上传部分：13.5 MB
  临时文件：.freelog/temp/upload-part-1.tmp
  
是否保留中间状态？[Y/n]: y

# 网络恢复后继续
$ freelog publish --resume ./dist/large-file.zip

⚠️ 检测到未完成的上传
  
Checkpoint 信息:
  资源 ID: res_large_abc
  已上传大小：13.5 MB
  
是否继续上传？[Y/n]: Y

→ 续传开始
[██████████░░] 100% 完成

✅ 上传成功！
  总大小：45 MB
  SHA1: abc123def456...
```

---

## B07 - 文件清单生成与预览

```bash
$ freelog pack --list ./src --output manifest.json

📁 扫描完成
  文件数：24
  总大小：2.3 MB
  
✅ 已生成文件清单：manifest.json

内容示例:
{
  "totalFiles": 24,
  "totalSize": "2.3MB",
  "sha1": "abc123...",
  "files": [
    {"path": "index.html", "size": 1024},
    {"path": "main.js", "size": 50176},
    {"path": "style.css", "size": 8192}
  ]
}

💡 可用于:
  • 发布前审查包含的文件
  • 对比不同版本的差异
  • 审计目的的记录
```

---

## B08 - 本地工程模板元数据标记

```bash
$ cat my-project/.freelog-template.json
{
  "templateId": "theme-react-starter",
  "templateVersion": "1.2.0",
  "createdAt": "2026-09-01T10:00:00Z",
  "author": "liu-kai-github"
}

$ freelog template info --project-path ./my-project

📋 项目模板信息

模板来源:
  模板 ID: theme-react-starter
  版本：1.2.0
  类型：React 主题
  
创建时间：2026-09-01
作者：liu-kai-github

本地状态:
  框架：React 18
  构建工具：Webpack 5
  
💡 建议升级:
  模板有新版 1.3.0 可用
  变更：性能优化、新增hooks
  
是否查看升级指南？[y/N]: n
```

---

## 📝 B 组场景发现的设计缺口

| 问题编号 | 场景编号 | 发现的问题 | 建议修订文档 |
|---------|---------|-----------|------------|
| B-01 | B01-B02 | 模板创建的独立性与集成性 | 03 节补充"模板能力边界" |
| B-02 | B03 | 独立压缩的 ignore 规则优先级 | 03 节补充"规则合并策略" |
| B-03 | B05 | 文件名编码兼容性 | 03 节补充"跨平台文件处理" |
| B-04 | B06 | 断点续传的 checkpoint 数据结构 | 06 节补充"上传状态机" |

---

继续阅读下一组场景：C1-普通资源首次发布场景...
