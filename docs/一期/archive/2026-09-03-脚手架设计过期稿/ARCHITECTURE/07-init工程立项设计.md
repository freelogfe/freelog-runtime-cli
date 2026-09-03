# 07 - init 工程立项设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **定位**: `init` 本地工程层的唯一规格。Console 没有对等页。  
> **对照**: [业务梳理/01-脚手架设计前置对照.md](../../业务梳理/01-脚手架设计前置对照.md)  
> **实现**: `packages/cli/src/commands/init.ts`、`packages/cli/src/services/init/`  
> **验收测试**: `packages/cli/tests/initFiveChoice.test.ts`、`packages/cli/tests/initCatalog.test.ts`

本轮只定 **本地立项**。不重写 F0/C0/F1/M0 发行编排，不新造命令。

---

## 1. 定位与不做清单

`init` 只建本地工程，**不**调用 `POST /v2/resources` / `POST /v2/resources/createBatch`。

| 做 | 不做 |
|----|------|
| 五选一大类 + 定稿叶子类型 | 不模仿 Console 三张入口卡，也不画成五张 Console 卡 |
| 写 `freelog.manifest.json` + `.freelog/state.json` + `.gitignore` | 不写 `manifest.yaml` |
| runtime/package 拉工程模板并默认 `pnpm install` | 不上传文件、不加策略、不上架 |
| none 显式 `--artifact-mode` | 不猜测打包方式 |
| collection 建空合集工程 | 不扫盘、不加目录项 |
| 打印下一步已有命令 | 不教 `update --status`、不教资源 `policy` 用在合集上 |

已有平台资源：`bind <resourceId|username/name>`，不要再 `init`。  
批量：`resource import-dir`（F1），**不进 init**。  
文件夹合集：`collection init-from-folder`（CLI 额外），**不进 init**。

---

## 2. 入口对照

Console `creatorEntry` 只有三张卡。CLI `init` 五选一是 **本地工程分类**。

```
Console 三张卡
  ├─ 发行单个资源  → F0（主题/插件/前端库/图片…同一向导）
  ├─ 批量发行资源  → F1 → resource import-dir（不是 init）
  └─ 发行合集      → C0 → collection create + item add

CLI init 五选一（只写本地）
  ├─ 主题 theme      → scaffold=runtime
  ├─ 插件 widget     → scaffold=runtime
  ├─ 前端库 package  → scaffold=package
  ├─ 其余资源 other  → scaffold=none
  └─ 合集 collection → scaffold=collection
```

| CLI 大类 | `--scaffold` | 对照 Console | 快捷子命令 |
|----------|--------------|--------------|------------|
| 主题 / 插件 | `runtime` | F0（类型不同） | `init theme` / `init widget` |
| 前端库/软件库 | `package` | F0 | `init package` |
| 其余资源 | `none` | F0 图片/视频/文件等 | 无 |
| 合集 | `collection` | C0 Step1 **之前** | `init <dir> --scaffold collection` |

`catalog.ts` 旧注释「与 Console 创建向导保持五类业务入口」作废。

---

## 3. TTY / `--yes` 流程

命令二进制是 `freelog-cli`（不是 `freelog`）。

### 3.1 交互（未传 `--yes`）

```
$ freelog-cli init my-project

[若目录像媒体夹] 只打印提示，不改走 import-dir / init-from-folder

请选择要创建的资源大类（工程立项五选一；批量发行请用 resource import-dir）
  • 主题
  • 插件
  • 前端库 / 软件库
  • 其余资源
  • 合集

── 主题 / 插件 ────────────────────────
  登录后从类型树定稿「主题」或「插件」
  请选择主题/插件工程模板
    vite-vue-ts | vite-vue | vite-react-ts | vite-react
  runtime 未传则默认 0.5
  资源短授权标识 *   （FORM-RES-NAME：1–60 字，非法字符转下划线）
  资源标题 *         （FORM-RES-TITLE：非空，最多 100 字）

── 前端库 / 软件库 ────────────────────
  先选 package 模板，再从类型树定稿「前端库/软件库」
  请输入前端库 namespace（空则拒绝；无前缀时自动加 freelogLibrary.）
  短标识 + 标题（同上）

── 其余资源 ──────────────────────────
  一级级选到叶子类型（可搜索 / 返回上一级）
  短标识 + 标题
  非交互时必须 --artifact-mode file|directory-zip

── 合集 ──────────────────────────────
  登录后拉 subjectType=4 类型树，选到叶子
  短标识 + 标题
  只写空合集 manifest，不加条目
```

`init theme|widget|package <dir>` 跳过第一层五选一，仍落 F0 对应 scaffold。

### 3.2 非交互（`--yes`）

| 条件 | 必须给出 | 否则 |
|------|----------|------|
| 无 `--resource-type` 且无 preset | `--resource-type` | 退出，提示脚本模式必须显式传类型 |
| `runtime` / `package` | `--template` | 提示 `template list --scaffold …` |
| `package` | `--namespace` | 退出 |
| `runtime` 未传 `--runtime` | 默认 `0.5` | — |
| `none` 未传 `--artifact-mode` | — | 退出，禁止猜测 |

已初始化（存在 `freelog.manifest.json` 或 `.freelog/state.json`）且未 `--yes`：拒绝覆盖。  
已绑定 `resourceId`：即使 `--yes` 也拒绝；需人工移走工程文件后再 bind。  
`runtime`/`package` 目标目录非空：拒绝拷模板；已有主题/插件工程用 `init . --scaffold none --runtime 0.5`。

---

## 4. 四套产物落盘

工程文件只有这两份 + gitignore，**没有** `manifest.yaml`。

| 文件 | 职责 |
|------|------|
| `freelog.manifest.json` | 用户意图（subject / 短名 / 类型 / 标题 / 版本意图） |
| `.freelog/state.json` | 平台事实（init 时未绑定，无 resourceId） |
| `.gitignore` | 写入 `/.freelog/state.json`、`/.freelog/cache/`、`/.freelog/tmp/`、`/.freelog-auth` |

默认版本意图一律 `1.0.0`。短名由目录名规范化：`[a-z0-9_-]+`。

### 4.1 `runtime`（主题 / 插件）

1. 按 `template-compat.json` 解析模板（本地 `--templates-dir` / `FREELOG_TEMPLATES_DIR` / 仓内 templates，否则 npm pack 缓存）
2. 拷 `template/` 到目标目录，按模板 `ejsIgnore` 渲染 EJS
3. 写 resource + version：`filePath=dist`（或模板 `filePath`），`artifactMode=directory-zip`，带 `runtimeVersion`
4. 未 `--skip-install` 时默认 `pnpm install`

### 4.2 `package`（前端库 / 软件库）

与 runtime 相同拷模板 + EJS + 双份工程文件；**必须** namespace；**不**写 runtimeVersion。  
`artifactMode` 仍是现码的 `directory-zip`（旧 04 文档写 `file` 作废）。

### 4.3 `none`（其余资源）

不拷模板、不装依赖。只写 resource + version。  
`filePath` 默认空（媒体类）或按类型 hint 为 `dist`。  
`artifactMode` 必须由用户给出，CLI 不按类型猜测。

### 4.4 `collection`（合集）

不拷前端模板、不扫盘。只写合集 manifest：

- `subject=collection`
- 空 `catalogueItems` / 空 `display`
- 版本意图 `1.0.0`，发布说明空
- `draftSync=null`

下一步才是 `collection create`，然后按 C0 主路径加已有资源。

---

## 5. 模板矩阵

来源：`packages/cli/compat/template-compat.json`（`schemaVersion=1`，`defaultRuntime=0.5`）。  
列出用 `freelog-cli template list --scaffold runtime|package`。

| 模板 id | scaffold | runtime | npmName |
|---------|----------|---------|---------|
| `vite-vue-ts` | runtime | 0.5 | `@freelog-cli/template-vite-vue-ts` |
| `vite-vue` | runtime | 0.5 | `@freelog-cli/template-vite-vue` |
| `vite-react-ts` | runtime | 0.5 | `@freelog-cli/template-vite-react-ts` |
| `vite-react` | runtime | 0.5 | `@freelog-cli/template-vite-react` |
| `package-js` | package | — | `@freelog-cli/template-package-js` |
| `package-react` | package | — | `@freelog-cli/template-package-react` |
| `package-vue` | package | — | `@freelog-cli/template-package-vue` |

旧 04 文档里的 `theme-vite-react` / `@freelog-cli/theme-react` / `collection` 模板 id **不是**现网矩阵。  
展示名见 `TEMPLATE_DISPLAY_NAMES`（如 `freelog主题-vite-vue-ts`）。

`0.4`：兼容表未列 0.4 runtime 时拒绝，提示用 `--runtime 0.5`。

---

## 6. 下一步命令串

`init` 成功后打印。必须是已有命令。禁止 `update --status`、`policy apply --from-file`、合集上用资源 `policy`。

### 6.1 单资源（runtime / package / none）

```
cd <dir>
pnpm install && pnpm build          # 仅 runtime / package
freelog-cli login --env dev
freelog-cli create --yes --env dev
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5 --env dev
                                    # package：去掉 --runtime
                                    # none：--file <你的文件路径> --artifact-mode <file|directory-zip>
freelog-cli publish --yes --env dev
freelog-cli policy template list --env dev
freelog-cli policy template apply <templateId> --yes --env dev
freelog-cli online --yes --env dev
```

首版文件用 `version set --file`，不要把 inherit 写在 `version set` 上。新版本 inherit 是 `publish --reuse-version`（M0，本轮不展开）。

### 6.2 合集（C0 主路径）

```
freelog-cli login --env dev
freelog-cli collection create --yes --env dev
freelog-cli collection item add <resourceId> --env dev
freelog-cli collection version set --description "首版" --env dev
freelog-cli collection publish --yes --env dev
freelog-cli collection policy template list --env dev
freelog-cli collection policy template apply <templateId> --yes --env dev
freelog-cli online --yes --env dev
```

`item add` 的真实参数是 **位置参数** `target`（resourceId 或相对路径），没有 `--resource-id`。  
默认串 **不**打印 `item import-dir`。扫盘是 CLI 额外路径，另起一行标注：`collection init-from-folder`。

---

## 7. 与相邻命令的边界

| 场景 | 走这条 | 不要走 |
|------|--------|--------|
| 新建本地工程 | `init` | `create`（那是打平台） |
| 已有 Console 资源 | `bind` | 再 `init` 一套 |
| 批量发行文件 | `resource import-dir --resource-type` | `init` 五选一 |
| 合集加已有资源（C0） | `collection item add <resourceId>` | 默认教扫盘 |
| 本地媒体先发再组盘 | `collection init-from-folder` 或 `item import-dir` | 写成 Console 主路径 |
| 上架 | `online` | `update --status` |

---

## 8. 验收

- [ ] 本文命令均可在 `packages/cli/src/commands/` 找到；合集策略只出现 `collection policy`
- [ ] 五选一不含批量、不含文件夹合集（`initFiveChoice.test.ts`）
- [ ] 合集 `initNextSteps` 含 `item add <resourceId>`，默认串不含 `item import-dir`
- [ ] 单资源下一步以 `policy template apply` 为主，不含 `policy apply --from-file`
- [ ] `initCatalog.test.ts`：theme/widget → runtime；package → package；none 可接入已有主题
- [ ] 旧 04 / COMMANDS / PHASE README 第一屏有过期横幅并指向本文
- [ ] F0/C0/H0/M0 PHASE 正文本轮零改动
