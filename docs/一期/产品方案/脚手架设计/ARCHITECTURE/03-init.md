# 03 - init：本地立项与模板工程

`init` 只创建本地工程和本地状态，**绝不**创建线上资源（不调 `POST /v2/resources`）。本期只覆盖单资源：普通资源立项，以及主题 / 插件模板工程。已有线上资源用 [bind](./04-bind.md)，不要重新 `init`。

---

## 1. 命令面与输入原则

| 命令 | 用途 | 类型来源 |
|------|------|------|
| `init [dir] [--type <leaf-code>]` | 普通单资源：只创建身份草稿 | 交互选择、搜索选择或直接输入叶子 code |
| `init theme [dir] [--template <id>]` | 创建主题模板工程 | 固定 `RT001`、`filePath=dist` |
| `init widget [dir] [--template <id>]` | 创建插件模板工程 | 固定 `RT002`、`filePath=dist` |
| `template list` | 查看可用模板 | 内置受控清单 |

`--type` 是普通资源类型的唯一正式 flag；旧的 `--resource-type` 仅可作为一个发布周期的兼容别名并输出弃用提示，不能同时传两个值。`--scaffold none` 不再是用户概念，不出现在帮助、设计或后续脚本示例中。

普通 `init` 必须在成功前确定一个**当前启用的最终叶子类型**。类型解析契约由 [创建 Step1 §1](../PHASE/单资源/创建/01-Step1-创建授权条目.md#1-选择资源类型) 定义，`init` 与 `create` 必须复用，不能有两套菜单或两套校验。它会读取类型服务，故需要已登录；主题 / 插件不需要登录。`RT001` 与 `RT002` 不属于普通 `init` 的可用结果：即使用户直接传入也必须拒绝，并指向 `init theme` / `init widget`，以保证固定类型总是从模板入口产生。

`init` 不上传、不加策略、不安装依赖、不运行构建、不渲染模板、不创建版本工作稿。创建后流程仍是 `login` → `create` → 人自行构建 → `create-version`。

---

## 2. 交互与非交互体验

### 2.1 普通资源

TTY 且未给 `--type` 时，进入统一类型选择器：

1. 从根节点逐层选择；非叶子只能继续展开，叶子才可确认。
2. 任一级可选“搜索资源类型”，搜索结果只显示启用叶子；选中后立即定稿。
3. 任一级可选“直接输入类型 code”；输入后在线校验，只有启用的最终叶子才可定稿。
4. 子级页面可返回上一级；取消整次 `init`，不写任何本地状态。

`--type <code>` 与“直接输入”走完全相同的在线校验。只接受 code，不把按名称的模糊匹配当作确定选择；按名称找类型必须先搜索、再从结果中选择。不存在、停用、非叶子、或固定的主题/插件类型（`RT001` / `RT002`）均失败，并展示 `type search <关键词>` 和交互入口。

`--yes` 表示不提问：普通 `init` 必须带有效 `--type`；没有或无效则失败。`init` 不支持“创建一个新类型”、`--type-name` 或把父类型加自定义名称提交给 `create`。

### 2.2 模板工程

TTY 下省略 `--template` 时，先显示模板 id、框架、语言和精确版本，让用户选择；取消不写目录。`--yes` 必须携带 `--template <id>`。主题和插件资源类型固定，绝不额外问类型，也不请求类型接口。

`[dir]` 省略时，TTY 询问“项目目录”；非 TTY 必须显式给出 `[dir]`，避免脚本意外向当前目录写入。目标可以不存在，或是一个空目录。唯一允许的非空例外是用户刚在该目标执行过 `login`：目录中只能有常规目录 `.freelog/`，且其中只能有认证选择器 `.freelog/auth`；`init` 必须保留它并在同一目录写入初始身份。存在业务文件、`N.json` / 工作稿 / index、其它 `.freelog` 文件、符号链接歧义或不可写时失败。`--yes` 只跳过确认，绝不是覆盖/合并开关；本期没有 `--force`。

---

## 3. 线上模板契约

模板开发副本位于 `packages/templates/`，但 CLI 只下载已发布的 npm 包，不从 CLI 安装包或本地开发目录复制。运行时清单是 CLI 内置的受控映射：

| id | npm 包 | 精确版本 |
|----|--------|----------|
| `vite-vue-ts` | `@freelog-cli/template-vite-vue-ts` | `4.0.0` |
| `vite-vue` | `@freelog-cli/template-vite-vue` | `4.0.0` |
| `vite-react-ts` | `@freelog-cli/template-vite-react-ts` | `4.0.0` |
| `vite-react` | `@freelog-cli/template-vite-react` | `4.0.0` |

不接受 npm 包名、URL、tag（包括 `latest`）或清单外 id。下载指定 tarball 和解包时禁用生命周期脚本；必须校验包内 `template.manifest.json` 的 id、包名、版本、适用范围与清单完全一致，并确认存在 `template/`。

本期只复制 `template/` 内容。模板内 `package.json` 的 `projectName` / `version` 占位符保持原样，不渲染、不执行 `pnpm install`、不构建，也不写任何模板元数据缓存。未来若需要渲染，必须另行定义输入来源、覆盖规则与升级路径。

---

## 4. 原子性、目录与提交顺序

初始化使用目标同一文件系统内的 staging 目录和独占初始化锁：先下载 / 解包 / 校验，再一次提交工程文件与 `.freelog/` 初始状态。目标不存在时优先原子 rename；目标是已存在空目录时，在锁保护下复制，并记录由本命令创建的文件清单以便失败精确回滚。若目标仅有 `.freelog/auth`，它是登录的既有认证选择器：提交时只把 staging 内的 `N.json` / `index.json` 原子移入该目录，绝不覆盖、移动或重新序列化 `auth`。

提交顺序为：

```text
确认输入 →（普通资源：验证叶子类型）→ staging 下载/校验模板
→ 获取初始化锁并再次检查目标为空（或仅有 `.freelog/auth`）→ 落工程文件
→ 原子写 N.json / index.json → 释放锁 → 成功提示
```

任一阶段失败或取消时：不得留下 `N.json`、`index.json`、半份模板或锁；仅允许保留用户原本就存在的空目标目录，或原先的 `.freelog/auth`。若检测到锁冲突或目标在确认后被第三方写入，立即停止且不清理未知文件。具体锁、原子写入和恢复规则见 [本地状态 §2.1](./02-本地状态.md#21-一致性与恢复)。

---

## 5. 初始本地状态

普通资源成功后写一份未绑定身份：

```text
.freelog/1.json
  schemaVersion: 1
  subject: resource
  typeCode: <已验证的叶子 code>
```

主题 / 插件成功后写：

```text
.freelog/1.json
  schemaVersion: 1
  subject: resource
  typeCode: RT001 | RT002
  filePath: dist

```

`init` 不写 `resourceId`、`env`、线上标题或授权标识；`name` 仅在 `create` 成功后写入。主题/插件也不写模板缓存。

---

## 6. 禁止

- 用非叶子、停用或模糊匹配的名称作为资源类型定稿；在 CLI 创建新类型
- 从本地 `packages/templates/`、archive 或未固定版本的远端模板复制
- 下载失败后仍写身份或显示成功；在锁外先检查、后复制
- 把 `--yes` 当覆盖开关，或在已有 `.freelog/` 中追加身份
- 执行模板脚本、安装依赖、构建、渲染 EJS、创建线上资源或版本工作稿
- 用 `artifactMode`、根 `freelog.manifest.json`、`--scaffold none` 作为新设计的一部分
