# 开发设计：Config 与平台字段

> 用户禁止手改 · Owner 管线 → [01-Owner与同步.md](./01-Owner与同步.md) · draftSync → [04-草稿转换层.md](./04-草稿转换层.md)

本地文件是平台数据的 CLI 缓存；写回以平台 + ensureOwner / pull 为准。

## 1. `freelog.resource.config`

| 字段 | 平台来源 | 说明 |
|------|----------|------|
| `userId` / `username` | resourceInfo | **必填** Owner |
| `resourceId` | 同名 | 主键 |
| `resourceName` / `resourceType` / `resourceTypeCode` | 同名 | 元信息；name/type 创建后不可变 |
| `resourceTitle` / `intro` / `coverImages` / `tags` | 同名 | listing |
| `policies` | policies | 策略 |
| `baseUpcastResources` | 同名 | 上抛 |
| `status` | status | 0/1/2/4 |
| `latestVersion` | info | 最新正式版 |

## 2. `freelog.version.config`

| 字段 | 说明 |
|------|------|
| `userId` | **必填**，与 resource 一致；禁止长期为 0 |
| `username` | 可选镜像 |
| `resourceId` / `resourceName` / `resourceType` | 资源上下文 |
| `version` / `description` / `filePath` | 发版意图（本地）；**资源 semver**，≠ 运行时档位 |
| `runtimeVersion` | 仅**运行时类资源**（主题/插件）：`"0.4"` \| `"0.5"`；有则 publish 必带；非运行时类型不写此字段（见 [11](./11-脚手架与模板.md)） |
| `fileSha1` / `filename` / `versionId` | 上传或 pull/publish 后 |
| `dependencies` / `baseUpcastResources` | 依赖与上抛意图 |
| `customPropertyDescriptors` / `inputAttrs` | 属性 |
| `draftSync` | 草稿指纹元数据（CLI 维护，见草稿文档） |

可选追溯（建议 `.freelog/scaffold-meta.json` 或 version.config 扩展）：`cliVersion`（如 `0.5.3`）/ `templateId` / `templateVersion`（如 `0.5.2`）。

归属校验以平台资源 owner（ensureOwner 写回后）为准。`filePath` 不被 `draft pull` 清空。

## 3. `freelog.collection.config`

| 字段 | 平台来源 | 说明 |
|------|----------|------|
| `userId` / `username` | resourceInfo | **必填** 合集 Owner |
| `resourceId` | 合集 ID | 主键 |
| listing 字段 | 同名 | title/intro/cover/tags/status |
| `catalogueProperty` / `items` | draft/正式目录摘要 | 缓存 |
| `policies` | policies | 合集策略 |

伪造本地 userId 无效；以平台为准。
