# 开发设计：Owner 与同步

> 写管线总览：[00](./00-总览与模块.md) · 草稿冲突：[04](./04-草稿转换层.md) · 数据边界：[06](./06-Config字段.md)

Owner 与同步只信平台事实。本地 state 是缓存，不是权限凭证；manifest 不保存 owner。

## 1. Owner 字段

```ts
type OwnerSnapshot = {
  userId: number;
  username: string;
};
```

| 来源 | 用途 |
|---|---|
| 当前登录态 | 判断“谁在执行命令” |
| `Resource.info` / collection info | 判断“资源属于谁” |
| `.freelog/state.json` | 加速展示；写命令前必须用平台刷新 |

比较规则：`Number(auth.userId) === Number(platform.userId)`。禁止直接比较 string/number。

## 2. 何时写 Owner

| 时机 | 行为 |
|---|---|
| `create` / `collection create` 成功 | 以接口返回或 `info` 回查写入 state |
| `pull` | 以平台 info 覆盖 state owner |
| 写命令前 | 若已有 resourceId，先 `info` 刷新 owner，再比较登录态 |
| `init` | 不写 owner |

manifest 中若出现 owner 字段，schema 应拒绝或忽略并警告；owner 只能属于 state。

## 3. ensureOwner

```text
1. getCurrentAuth(workspace > global)
2. 无 auth -> exit 2
3. 无 resourceId -> 仅允许 create / collection create
4. 有 resourceId -> Resource.info
5. 用平台 owner 覆盖 state.owner
6. 平台 owner 与 auth 不一致 -> exit 2
7. username 变化 -> warn，并以平台为准
```

授权标识规则：

1. `create` 接收短名，不接收 `username/name`。
2. CLI 用当前登录 `username/name` 预查重。
3. 平台创建成功后，完整 resourceName 写入 state。
4. `pull` 后若平台完整 resourceName 前缀与 owner.username 不一致，按平台异常处理，不能继续写。

## 4. ensureSynced

同步关注平台 listing / latestVersion / 草稿状态是否与本地 state 的基线一致。manifest 是用户意图，不能被“本地改了”简单判定为冲突。

| 情况 | 默认行为 | `--no-auto-pull` |
|---|---|---|
| state 落后，manifest 无同字段未提交意图 | 自动 `pull` 后继续 | exit 3 |
| 平台与本地 manifest 修改同一 listing 字段 | exit 3 | exit 3 |
| 平台发版草稿变化 | 只在 `draft push` 阻断；其它命令由 `status` 提示 | 同左 |
| 已同步 | 继续 | 继续 |

`pull` 的写入策略：

1. state 完全刷新平台事实。
2. listing 字段只在用户显式 `pull --apply-listing` 时写入 manifest；默认仅报告差异，避免覆盖用户意图。
3. latestVersion、policies、owner、resourceName 永远写 state。
4. collection catalogue draft items 写 state 缓存；用户目录意图仍在 manifest。

## 5. 命令矩阵

| 命令 | Owner | Sync | 说明 |
|---|---|---|---|
| `init` | 否 | 否 | 只建本地文件 |
| `type list/search/info` | 否 | 否 | 只查类型 |
| `create` / `collection create` | 登录即可 | 否 | 创建成功后写 state |
| `update` / `policy *` / `online` / `offline` | 是 | 是 | listing / 策略 / 状态 |
| `version set` / `dep *` | 有 id 时是 | 是 | 改本地 manifest 意图 |
| `publish` / `version edit` | 是 | 是 | 正式版本 |
| `draft *` | 是 | 草稿算法 | 见 [04](./04-草稿转换层.md) |
| `collection item *` / `collection publish` | 是 | 是 | 合集维度 |

## 6. status 展示

```text
环境:     prod
当前登录: alice (1001)
资源所属: alice (1001)
资源壳:   已创建 resourceId=...
listing:  已同步 / 平台有更新 / 本地有未提交意图 / 冲突
版本:     manifest 1.0.1 | 平台 latest 1.0.0
平台草稿: 有/无
```

`--json` 必含 `auth`、`owner`、`resource`、`sync`、`platformVersionDraft`、`localDraftSync`。`localDraftSync` 无记录时必须是 `null`。
