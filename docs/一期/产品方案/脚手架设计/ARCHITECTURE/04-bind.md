# 04 - bind

把已经在平台上的**普通单资源**，接到当前工作区的一份 `N.json`。只写不可变身份和本地文件对应关系。  
不是 `pull`。看线上用 `status`。字段约定见 [02](./02-本地状态.md)。  
`subjectType===4`（合集）：本期失败，见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。

```
freelog-cli bind <resourceId|username/name> [--resource <selector>] [--artifact <path>] [--force] [--yes]
```

必须先 `login`。GET 详情，必须是当前账号的。只接受代表单资源的 `subjectType`：响应可为 `1`、`"1"`、`[1]` 或 `["1"]`，统一按“值中包含 1”判断；只包含其他主体类型时失败。仅含 `4` 的合集仍报“合集本期不做”。

---

## 1. 什么时候用

| 场景 | 命令 | 不要 |
|------|------|------|
| 线上已有，本地有文件，以后要发新版 | `bind <id\|username/name> --artifact <path>` | 再 `create`；用 `pull` |
| 自己的壳、还没发行、本地没有这份 | 同上 `bind`，再 `create-version` | 再 `create`（换名也不行） |
| 主题/插件已 `init`，已有 `filePath` | `bind <id\|username/name>` | 再 `init` |
| 已有本地主题/插件工程，要接入线上资源并发新版 | `bind <id\|username/name> --artifact <dist\|build>` | 为了 bind 再 `init` |
| `create` 成功但 `N.json` 没写上 id | 同一条 `bind` | 再 `create` |
| 本地新发 | `create --artifact` | 先 bind 再 create |
| 合集 | **本期不做** | 见暂缓 |

没有 `.freelog/` 时可以自己建，不必先 `init`。

---

## 2. 写入

只写：`schemaVersion=1`、`resourceId` / `name` / `title` / `typeCode` / `subject` / `filePath`；非 prod 才写 `env`。所有写入遵守 [02 §2.1](./02-本地状态.md#21-一致性与恢复) 的锁和原子事务。
策略、版本 **不写**；标题作为选择元数据从平台详情写入。

`--artifact` 必须是工作区内的相对路径；CLI 会将 `./dist` 规范为 `dist`，并拒绝绝对路径、空路径与越过工作区的 `..` 路径。它指向普通文件 → 与 `create --artifact` 相同。指向目录 → 仅当类型是 `RT001`/`RT002`。其余类型给目录：失败「不支持文件夹」。

| 线上 | 工作区 | `--artifact` |
|------|--------|----------|
| 普通资源 | 多文件，或还没有对应 `N.json` | **必须** |
| 普通资源 | 仅一份且已有 `filePath` | 可省 |
| 普通资源 | 仅一份、没有 `filePath` | **必须** |
| 主题 / 插件 | 已 `init` 且已有目录 `filePath` | 可省 |
| 主题 / 插件 | 没有本地身份或没有目录记录 | **必须**（传构建目录） |

`bind` 从平台详情写回 `RT001` / `RT002` 后，后续 `create-version` / `update-version` 会按目录自动临时压缩。对既有本地项目，`bind` 不下载、不复制模板，也不创建任何模板元数据；模板来源不是主题/插件发版的前提。

---

## 3. 对上哪一份

1. 已有同一 `resourceId` → 那份  
2. 显式 `--resource` 指向未绑定身份 → 填上该份
3. 未指定且仅一份未绑定、且 subject 对得上 → 填上
4. 没有未绑定身份 → 新建 `max+1`
5. 有多份未绑定身份 → 失败并要求显式 `--resource`；不得由 TTY 或编号顺序猜测

同一工作区：一个 `resourceId` 一次；一个 `filePath` 一份。

同一 id 再 bind 幂等：仅当该份 `N.version.json` 的 `resourceId` / `resourceTypeCode` 与线上身份一致才保留；不一致按损坏状态失败。换绑要 `--force --yes`，并在同一事务中删除该份工作稿。这个 id 已在另一份、路径已被占用 → 失败。

本期没有 `unbind`。用户可以备份后删除同一编号的 `N.json` 与 `N.version.json` 这一完整状态单元，再重新 `bind`；单独删除身份会留下孤儿工作稿，CLI 必须停止并给出恢复提示。自动身份删除或重建仍只能通过本地状态事务同时处理 `N.json`、`N.version.json` 和 `index.json`。

成功后只提示 `status`。不 pull、不自动 `create-version`。
