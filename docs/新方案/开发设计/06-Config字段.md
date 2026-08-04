# 开发设计：Manifest 与 State 字段

> 文件名保留历史编号；内容以目标态为准。用户意图写 `freelog.manifest.json`，CLI 状态写 `.freelog/state.json`。

## 1. 生命周期

```text
init
  -> 写 freelog.manifest.json
  -> 写 .freelog/state.json 空壳

create / collection create
  -> 平台创建资源壳
  -> 写 state.resource

version set / dep * / collection item *
  -> 写 manifest 中的用户意图

publish / collection publish / policy / online / offline / pull / draft *
  -> 调平台
  -> 写 state；只有用户明确要求时才改 manifest

status
  -> 读 manifest + state + platform
  -> 不写盘
```

## 2. `freelog.manifest.json`

最小结构：

```json
{
  "$schema": "./node_modules/@freelog-cli/cli/schema/freelog-manifest.schema.json",
  "schemaVersion": 1,
  "subject": "resource",
  "identity": {
    "name": "my-resource"
  },
  "resource": {
    "typeCode": "image",
    "title": "My Resource",
    "intro": "",
    "tags": [],
    "coverImages": []
  },
  "version": {
    "version": "1.0.0",
    "filePath": "./dist",
    "description": "",
    "runtimeVersion": null,
    "dependencies": [],
    "baseUpcastResources": [],
    "authExcludedItems": [],
    "inputAttrs": {},
    "customPropertyDescriptors": []
  },
  "policies": [],
  "collection": null
}
```

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 当前固定 1 |
| `subject` | `resource` / `collection` |
| `identity.name` | 短授权名，不带 username 前缀 |
| `resource.typeCode` | 平台 resourceTypeCode，创建后不可变 |
| `resource.title/intro/tags/coverImages` | listing 意图 |
| `version.*` | 下一版发布意图；合集可为空或只放合集发版表单字段 |
| `policies` | 可选策略声明；也可用 `policy apply --from-file` |
| `collection` | 合集目录、展示、收录规则意图；单品为 null |

manifest 不允许保存：

1. `resourceId`
2. 完整 `username/name`
3. `userId` / `username`
4. `latestVersion`
5. `fileSha1` / `filename` / `versionId`
6. `draftSync`
7. token/cookie

## 3. `.freelog/state.json`

最小结构：

```json
{
  "schemaVersion": 1,
  "env": "prod",
  "resource": {
    "resourceId": null,
    "resourceName": null,
    "resourceType": null,
    "resourceTypeCode": null,
    "subjectType": null,
    "owner": null,
    "status": null,
    "latestVersion": null,
    "policies": []
  },
  "version": {
    "lastPublishedVersion": null,
    "lastPublishedVersionId": null,
    "fileSha1": null,
    "filename": null,
    "draftSync": null
  },
  "collection": {
    "catalogueDraft": null,
    "catalogueProperty": null,
    "collectRules": null,
    "rss": null
  },
  "sync": {
    "lastPulledAt": null,
    "listingFingerprint": null,
    "platformUpdateDate": null
  }
}
```

| 字段 | 来源 |
|---|---|
| `env` | 登录或命令环境 |
| `resource.*` | `create` 返回 / `Resource.info` |
| `version.lastPublishedVersion/lastPublishedVersionId` | `publish` 成功后写入的正式版本事实 |
| `version.fileSha1/filename` | publish / draft pull 中的平台文件信息；`version set` 修改 version/filePath 时必须清理旧值 |
| `version.draftSync` | `draft push/pull/discard` |
| `collection.catalogueDraft` | `catalogues/drafts` |
| `sync.*` | `pull` / 写命令后的平台基线 |

state 可随时删除；删除后 `status` / `pull` / 写命令会按平台重建可恢复部分。不能恢复的本地意图必须只在 manifest。

## 4. 单品与合集差异

| 项 | 单品 | 合集 |
|---|---|---|
| `subject` | `resource` | `collection` |
| 创建 | `Resource.create` | `Resource.create` with subjectType=4 |
| 发版 | `Resource.createVersion` | `Resource.updateCollection` |
| 文件 | `version.filePath` 指向文件或构建目录 | 合集本身通常无上传文件 |
| 目录 | 无 | `collection.items` / catalogue draft |
| 上架 | latestVersion + 启用策略 | 同样严格 |

## 5. 原子写与保留未知字段

1. 写 manifest/state 都走临时文件 + rename。
2. schema 允许保留未知字段，但命令不得依赖未知字段。
3. CLI 修改 manifest 时只改命令负责的字段，避免抹掉用户手工维护的声明。
4. CLI 修改 state 时可以整体重建 state，因为 state 属于 CLI。
5. Owner 校验、自动同步、普通 `pull` 只写 state；不得静默覆盖 `manifest.resource` 的 listing 意图。
6. 只有 `update` / `collection update` / `pull --apply-listing` 可以改 `manifest.resource.title/intro/tags/coverImages`。

## 6. `.gitignore`

`init` 必须确保：

```gitignore
.freelog/state.json
.freelog/cache/
.freelog/tmp/
```

manifest 必须提交；state 不提交。
