# 03 - init

`init` 只建本地工程，**不**调用 `POST /v2/resources`。发行见 PHASE。已有线上资源走 [bind](./04-bind.md)，不要再 `init`。

---

## 1. 做 / 不做

| 做 | 不做 |
|----|------|
| 四选一大类 + 定稿叶子类型（runtime / package / none；快捷 theme、widget） | 不模仿 Console 三张入口卡 |
| 写 `.freelog/1.json` + `index.json`（字段见 [02](./02-本地状态.md)） | 不写根上 `freelog.manifest.json` |
| runtime/package 拉模板并默认 `pnpm install` | 不上传、不加策略、不上架 |
| 主题/插件写死 `RT001` / `RT002`，`filePath=dist` | 不猜测类型；不打 zip |
| — | `collection` scaffold **本期不做**，见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md) |

---

## 2. 选大类

Console 入口只有「单个资源 / 合集」。CLI 本期只做单资源的本地工程分类。

| 大类 | `--scaffold` | 之后 | 快捷 |
|------|--------------|------|------|
| 主题 `RT001` / 插件 `RT002` | `runtime` | Step1 | `init theme` / `init widget` |
| 前端库 / 软件库 | `package` | Step1 | `init package` |
| 其余资源 | `none` | Step1 | — |
| 合集 | `collection` | **本期不做** | 见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md) |

---

## 3. TTY / `--yes`

二进制是 `freelog-cli`。

交互：选大类 → 定稿叶子类型 → 短标识。标题留给 `create`，不写进 `N.json`。媒体夹只提示：每天单发用 `create --file`。  
选到合集：失败并指向暂缓，不要继续落盘。

`--yes`：`init theme` / `init widget` 必须 `--template`；`init` 无快捷且无类型则必须 `--resource-type`；package 必须 `--template` 与 `--namespace`。已有 `index.json` 且未 `--yes`：拒绝覆盖。不要 `--artifact-mode`。

---

## 4. 落盘

不写 `resourceId` / `env` / `title`。短名由目录名规范化。

| scaffold | 产物 |
|----------|------|
| runtime | 拷模板；`typeCode` 写死 `RT001` 或 `RT002`；`filePath=dist`；默认 `pnpm install`；建空的 `1.version.json`。**不**打 zip、**不**跑构建 |
| package | 拷模板，必须 namespace；本期场景不做前端库 |
| none | 不拷模板；`filePath` 可空（发版再确认文件）；`typeCode` 按选中的叶子 |
| collection | **本期不落盘** |

模板矩阵：`template list --scaffold runtime|package`（`template-compat.json`）。现网四套 vite + 三套 package。`0.4` 未列则拒绝。

主题 / 插件发行时：人自己构建出 `dist`（或改成 `build`），CLI 再打 zip。见 [06](./06-发行物与压缩.md)。`init` 只立项。

---

## 5. 下一步

下一步：`login` → `create` → `create-version`（发行版本）→ `policy template apply` → `online`。已有版本再发：`update-version`，见 [更新版本](../PHASE/单资源/更新版本/01-更新版本.md)。  
合集命令不要写进主路径。
