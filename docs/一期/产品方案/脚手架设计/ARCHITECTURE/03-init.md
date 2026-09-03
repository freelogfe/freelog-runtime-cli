# 03 - init

`init` 只建本地工程，**不**调用 `POST /v2/resources`。发行见 PHASE。已有线上资源走 [bind](./04-bind.md)，不要再 `init`。

---

## 1. 做 / 不做

| 做 | 不做 |
|----|------|
| 五选一大类 + 定稿叶子类型 | 不模仿 Console 三张入口卡 |
| 写 `.freelog/1.json` + `index.json`（字段见 [02](./02-本地状态.md)） | 不写根上 `freelog.manifest.json` |
| runtime/package 拉模板并默认 `pnpm install` | 不上传、不加策略、不上架 |
| none 显式 `--artifact-mode` | 不猜测打包方式 |
| collection 建空合集工程 | 不扫盘、不加目录项 |

---

## 2. 五选一

Console 入口只有「单个资源 / 合集」。CLI 五选一是**本地工程分类**。

| 大类 | `--scaffold` | 之后 | 快捷 |
|------|--------------|------|------|
| 主题 / 插件 | `runtime` | F0 | `init theme` / `init widget` |
| 前端库 / 软件库 | `package` | F0 | `init package` |
| 其余资源 | `none` | F0 | — |
| 合集 | `collection` | C0 之前 | `init <dir> --scaffold collection` |

---

## 3. TTY / `--yes`

二进制是 `freelog-cli`。

交互：五选一 → 定稿叶子类型 → 短标识。标题留给 `create`，不写进 `N.json`。媒体夹只提示：每天单发用 F0 `--file`。

`--yes`：无类型则必须 `--resource-type`；runtime/package 必须 `--template`；package 必须 `--namespace`；none 必须 `--artifact-mode`。已有 `index.json` 且未 `--yes`：拒绝覆盖。

---

## 4. 落盘

不写 `resourceId` / `env` / `title`。短名由目录名规范化。

| scaffold | 产物 |
|----------|------|
| runtime | 拷模板；`filePath=dist`，`artifactMode=directory-zip`；默认 `pnpm install` |
| package | 同 runtime，必须 namespace |
| none | 不拷模板；`filePath` 可空；`artifactMode` 必须显式 |
| collection | 无 `filePath`；index `.` → 1；不加目录项 |

模板矩阵：`template list --scaffold runtime|package`（`template-compat.json`）。现网四套 vite + 三套 package。`0.4` 未列则拒绝。

---

## 5. 下一步

单资源：`login` → `create` → `publish` → `policy template apply` → `online`。inherit 是 `publish --reuse-version`。  
合集：`login` → `collection create` → `item add <resourceId|username/name>` → `collection publish`。
