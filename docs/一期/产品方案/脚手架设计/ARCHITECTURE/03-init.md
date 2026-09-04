# 03 - init

`init` 只建本地工程，**不**调用 `POST /v2/resources`。发行见 PHASE。已有线上资源走 [bind](./04-bind.md)，不要再 `init`。

---

## 1. 做 / 不做

| 做 | 不做 |
|----|------|
| 四选一大类 + 定稿叶子类型（runtime / package / none；快捷 theme、widget） | 不模仿 Console 三张入口卡 |
| 写 `.freelog/1.json` + `index.json`（字段见 [02](./02-本地状态.md)） | 不写根上 `freelog.manifest.json` |
| runtime/package 拉模板并默认 `pnpm install` | 不上传、不加策略、不上架 |
| none 显式 `--artifact-mode` | 不猜测打包方式 |
| — | `collection` scaffold **本期不做**，见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md) |

---

## 2. 选大类

Console 入口只有「单个资源 / 合集」。CLI 本期只做单资源的本地工程分类。

| 大类 | `--scaffold` | 之后 | 快捷 |
|------|--------------|------|------|
| 主题 / 插件 | `runtime` | Step1 | `init theme` / `init widget` |
| 前端库 / 软件库 | `package` | Step1 | `init package` |
| 其余资源 | `none` | Step1 | — |
| 合集 | `collection` | **本期不做** | 见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md) |

---

## 3. TTY / `--yes`

二进制是 `freelog-cli`。

交互：选大类 → 定稿叶子类型 → 短标识。标题留给 `create`，不写进 `N.json`。媒体夹只提示：每天单发用 `create --file`。  
选到合集：失败并指向暂缓，不要继续落盘。

`--yes`：无类型则必须 `--resource-type`；runtime/package 必须 `--template`；package 必须 `--namespace`；none 必须 `--artifact-mode`。已有 `index.json` 且未 `--yes`：拒绝覆盖。

---

## 4. 落盘

不写 `resourceId` / `env` / `title`。短名由目录名规范化。

| scaffold | 产物 |
|----------|------|
| runtime | 拷模板；`filePath=dist`，`artifactMode=directory-zip`；默认 `pnpm install`；建空的 `1.version.json` |
| package | 同 runtime，必须 namespace；建空的 `1.version.json` |
| none | 不拷模板；`filePath` 可空；`artifactMode` 必须显式；同样建空的 `1.version.json`（游戏包等也要配属性） |
| collection | **本期不落盘** |

模板矩阵：`template list --scaffold runtime|package`（`template-compat.json`）。现网四套 vite + 三套 package。`0.4` 未列则拒绝。

---

## 5. 下一步

下一步：`login` → `create` → `create-version`（发行版本）→ `policy template apply` → `online`。已有版本再发：`update-version`，见 [更新版本](../PHASE/单资源/更新版本/01-更新版本.md)。  
合集命令不要写进主路径。
