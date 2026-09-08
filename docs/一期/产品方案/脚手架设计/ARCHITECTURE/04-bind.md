# 04 - bind

把已经在平台上的**普通单资源**，接到当前工作区的一份 `N.json`。只写不可变身份和本地文件对应关系。  
不是 `pull`。看线上用 `status`。字段约定见 [02](./02-本地状态.md)。  
`subjectType===4`（合集）：本期失败，见 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。

```
freelog-cli bind <resourceId|username/name> --file <path> [--force] [--yes]
freelog-cli bind <resourceId|username/name> [--force] [--yes]
```

必须先 `login`。GET 详情，必须是当前账号的。只接受代表单资源的 `subjectType`：响应可为 `1`、`"1"`、`[1]` 或 `["1"]`，统一按“值中包含 1”判断；只包含其他主体类型时失败。仅含 `4` 的合集仍报“合集本期不做”。

---

## 1. 什么时候用

| 场景 | 命令 | 不要 |
|------|------|------|
| 线上已有，本地有文件，以后要发新版 | `bind <id\|username/name> --file <path>` | 再 `create`；用 `pull` |
| 自己的壳、还没发行、本地没有这份 | 同上 `bind`，再 `create-version` | 再 `create`（换名也不行） |
| 主题/插件已 `init`，已有 `filePath` | `bind <id\|username/name>` | 再 `init` |
| `create` 成功但 `N.json` 没写上 id | 同一条 `bind` | 再 `create` |
| 本地新发 | `create --file` | 先 bind 再 create |
| 合集 | **本期不做** | 见暂缓 |

没有 `.freelog/` 时可以自己建，不必先 `init`。

---

## 2. 写入

只写：`schemaVersion=1`、`resourceId` / `name` / `typeCode` / `subject` / `filePath`；非 prod 才写 `env`。所有写入遵守 [02 §2.1](./02-本地状态.md#21-一致性与恢复) 的锁和原子事务。
标题、策略、版本 **不写**。

`--file` 指向普通文件 → 与 `create --file` 相同。指向目录 → 仅当类型是 `RT001`/`RT002`。其余类型给目录：失败「不支持文件夹」。

| 线上 | 工作区 | `--file` |
|------|--------|----------|
| 普通资源 | 多文件，或还没有对应 `N.json` | **必须** |
| 普通资源 | 仅一份且已有 `filePath` | 可省 |
| 普通资源 | 仅一份、没有 `filePath` | **必须** |

---

## 3. 对上哪一份

1. 已有同一 `resourceId` → 那份  
2. 否则 `--file` 已在某份 `filePath` → 那份  
3. 否则仅一份未绑定且 subject 对得上 → 填上  
4. 否则新建 `max+1`

同一工作区：一个 `resourceId` 一次；一个 `filePath` 一份。

同一 id 再 bind 幂等：仅当该份 `N.version.json` 的 `resourceId` / `resourceTypeCode` 与线上身份一致才保留；不一致按损坏状态失败。换绑要 `--force --yes`，并在同一事务中删除该份工作稿和模板缓存（旧稿对不上新壳）。这个 id 已在另一份、路径已被占用 → 失败。

本期没有 `unbind`。不得建议人只手动删除 `N.json`：那会留下同编号工作稿 / 模板缓存并破坏索引。身份删除或重建只能通过本地状态事务同时处理 `N.json`、`N.version.json`、`N.template.json` 和 `index.json`；在提供正式删除命令前，检测到孤儿文件即失败并要求恢复身份或人工按完整事务清理。

成功后只提示 `status`。不 pull、不自动 `create-version`。
