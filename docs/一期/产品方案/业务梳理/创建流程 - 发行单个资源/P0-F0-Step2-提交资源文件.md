# P0-F0-Step2: 提交资源文件

## 概述

单资源向导第 2 步：按 Step1 写入的 `step2_resourceTypeConfig` 上传文件、解析属性、可选配置依赖，再 `createVersion`（版本号固定 `1.0.0`）进入 Step3。

步骤标题：`rqr_step2` → 「提交资源文件」。

### 主流程 (ASCII)

```
进入 Step2（已有 resourceId + uploadEntry）
  → 无文件：按类型配置展示本地上传 / 存储空间 / Markdown / 漫画
  → 上传或编辑成功 → 得到 sha1 + filename，解析系统属性
  → 可补自定义属性（最多 30）、可选配置（类型允许时）、依赖授权
  → 视频类型可上传版本封面（当前 createVersion 未传该字段）
  → dirty 防抖 300ms 存草稿
  → 「提交」：依赖须全部授权 → POST createVersion → step = 3
  或「稍后处理」→ 跳资源版本信息页
```

---

## 一、选择并上传文件

### 操作流程

1. 四种入口是否出现由 Step1 的 `fileCommitMode` 位决定，见 [P0-F0 总览](./P0-F0-单资源发布流程.md)。
2. **本地上传** `FLocalUpload`：带 `limitFileSize`、`resourceTypeCode`；成功派 `onSucceed_step2_localUpload`（`fileName` + `sha1`），`from='本地上传'`。上传中显示进度（百分比封顶 99）和硬编码「取消上传」。
3. **存储空间** `FStorageSpace`：成功派 `onSucceed_step2_storageSpace`（`objectName` + `sha1`），`from='存储空间'`。
4. **Markdown / 漫画**：点入口先 `lookDraft`；无草稿则 `saveVersionsDraft` 空草稿（`versionInput='1.0.0'`），再打开对应 Drawer。关闭后再 `lookDraft`，用 `selectedFileInfo` 回填并重新解析属性。
5. 上传成功后清 `step2_videoCover`，`systemPropertiesState='parsing'`，调用 `handleData_By_Sha1_And_ResourceTypeCode_And_InheritData2`。失败 toast `failedMsg`。

无文件时底部「下一步」在 `!fileInfo` 时禁用。有文件后「提交」还要求 `step2_isCompleteAuthorization`。

### API 调用

| 操作 | FServiceAPI / 工具 | HTTP | i18n key (zh_CN) |
|------|-------------------|------|------------------|
| 本地/存储上传 | 组件内存储上传（得到 sha1） | 存储文件接口（组件内部） | `createversion_object_fromlocal`: 「本地上传」；`createversion_object_fromstorage`: 「存储空间」 |
| 解析属性 | `handleData_By_Sha1_And_ResourceTypeCode_And_InheritData2` | 按 sha1 + typeCode 取系统/自定义属性 | `creatversion_property_msg_backendprocessing`: 「属性正在解析...」 |
| 读草稿 | `Resource.lookDraft` | `GET /v2/resources/{resourceId}/versions/drafts` | — |
| 写草稿 | `Resource.saveVersionsDraft` | `POST /v2/resources/{resourceId}/versions/drafts` | 失败硬编码「草稿保存失败」 |
| 下载已选文件 | 浏览器跳转 | `GET /v2/storages/files/{sha1}/download?attachmentName=` | `edit_resource_vmgnt_btn_download`: 「下载」 |

### 字段约束

| 字段 | 约束 | 说明 |
|------|------|------|
| `step2_fileInfo` | `{ name, sha1, from }` 或 null | 提交必填 |
| `limitFileSize` | Step1 算出的字节上限 | 交给 `FLocalUpload` |
| `from` | `本地上传` / `存储空间` / 或以「最近编辑时间」开头 | 后者展示 `createversion_object_lastmodified` + 时间 |

### Console 源码位置

- `creator/Step2/index.tsx` L168–225：四入口；L100–158：上传进度；L230–253：无文件时按钮
- `step2Effects.ts` L25–139：本地/存储成功；L140–420：Markdown/漫画开闭与草稿回填

---

## 二、已选文件与版本封面

### 操作流程

1. 展示文件名、来源、图标（有 mime/sha1 的图/视频或 `step2_videoCover` 用封面图）。
2. `isSupportEdit`：解析中禁用；按 `uploadEntry` 打开 Markdown 或漫画编辑。
3. `isSupportDownload`：跳存储下载 URL。
4. 删除：确认框后 `onRemove_step2_file`，清空文件/封面/属性，保留 persisted additional。
5. `resourceType` 名称任一段含「视频」时显示 `FUploadCover`。成功只写入 `step2_videoCover` 并 +dirty。`createVersion` 里该字段仍是 TODO，**当前不会提交给平台**。按钮文案硬编码「上传视频封面」/「更换视频封面」。

### API / i18n

| 场景 | i18n key (zh_CN) |
|------|------------------|
| 删除确认 | `createversion_remove_file_confirmation`: 「确认移除吗？」 |
| 删除确定 | `createversion_remove_file_btn_remove`: 「移除」 |
| 取消 | `btn_cancel`（见 i18n.json） |
| 删除按钮 | `remove` |
| 编辑 | `createversion_btn_edit`: 「编辑」 |

### Console 源码位置

- `Step2/index.tsx` L61–64：视频判断；L265–452：文件卡与封面；L399–428：删除
- `step2Effects.ts` L421–441：移除文件
- `step2Effects.ts` L533：`createVersion` 注释写明 videoCover 未传

---

## 三、属性、可选配置、依赖

### 操作流程

1. **属性**：系统属性（`raw` 且空值不展示）+ 自定义属性。自定义最多 30 条，经 `fResourcePropertyEditor3` 添加。自定义 value 可空，maxLength 100。系统 `additional` 且有 `valueConfig` 才可改 value。
2. **更多设置**默认收起。展开后：
   - 类型 `isSupportOptionalConfig` 时显示可选配置，最多 30，`fResourceOptionEditor`（`input` / `select`）。
   - `FMicroAPP_Authorization`：`licenseeId=resourceId`，`mainAppType='resourceInVersionUpdate'`。回写依赖、上抛、是否授权完成、`authExcludedItems`。声明器 + 处理器的加树 / 签约 / 支付全量见 [P0-D](../依赖与签约/P0-D-依赖管理与签约.md)。
3. dirty 变化防抖 300ms 调 `onTrigger_step2_SaveDraft`：先 `lookDraft` 再合并写回，`versionInput` 固定 `1.0.0`。

### 字段约束

| 字段 | 上限 | 可删 |
|------|------|------|
| 自定义属性 | 30 | ✅ |
| 自定义属性 value | 100 | — |
| 可选配置 | 30（且类型允许） | ✅ |
| 依赖授权 | 提交时 `isCompleteAuthorization` 必须为 true | 微前端内处理 |

### Console 源码位置

- `Step2/index.tsx` L468–682：属性；L686–925：更多设置 / 可选配置 / 授权
- `step2Effects.ts` L442–495：改属性/配置 +dirty；L603–670：存草稿
- `Step2/index.tsx` L66–78：dirty 300ms 存草稿

---

## 四、提交版本

### 操作流程

1. 无 `fileInfo` 或授权未完成则禁用；effects 再拦一次，未授权 toast 硬编码「依赖中存在未获取授权的资源」。
2. `Resource.createVersion`：
   - `resourceId`，`version='1.0.0'`，`fileSha1`，`filename`
   - `baseUpcastResources`：`{ resourceId }`
   - `dependencies`：`{ resourceId, versionRange }`
   - `authExcludedItems`：从合约列表展平为 `contractId`
   - `inputAttrs`：系统属性里 `type==='additional'` 的 key/value
   - `customPropertyDescriptors`：自定义 → `readonlyText`；可选配置 input → `editableText`，select → `select`（默认第一项）
   - `description`: `''`
3. 失败 toast 平台 `msg`。成功 `step=3`，dirty 清零。
4. 「稍后处理」：`LinkTo.resourceVersionInfo({ resourceID })`，不带版本号。

### API

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 创建版本 | `Resource.createVersion` | `POST /v2/resources/{resourceId}/versions` |

按钮：`rqr_step2_btn_later` 「稍后处理」；`rqr_step2_btn_next` 「提交」；热点 `hotpots_rqr_submitresource` 「点击提交您的资源」。

### Console 源码位置

- `Step2/index.tsx` L930–977：有文件时按钮
- `step2Effects.ts` L496–602：提交

---

## 五、CLI 对照

| Console | CLI | 决策 |
|---------|-----|------|
| 本地上传 + sha1 | `version set --file` + `publish` | ✅ |
| 存储空间 / Markdown / 漫画 | — | ❌ 取舍规范：仅 localUpload |
| 视频封面 | `version set --video-cover` 写本地意图 | Console 未传入 createVersion；CLI 以实现为准 |
| 自定义属性 / 可选配置 | manifest / YAML | ⚠️ 简化 |
| 依赖授权 | `dep auth` 仅免费策略 | ⚠️ 简化 |
| 草稿 300ms | checkpoint / draft | ✅ 恢复，不模仿 300ms |
| 首版号 | `--version 1.0.0` | Console 写死 1.0.0；CLI 可显式传 |

```text
freelog-cli version set --version 1.0.0 --file <path> --env <env>
freelog-cli publish --yes --env <env>
```

---

## 六、本步 i18n

| key | zh_CN |
|-----|-------|
| `rqr_step2` | 提交资源文件 |
| `rqr_step2_btn_later` | 稍后处理 |
| `rqr_step2_btn_next` | 提交 |
| `hotpots_rqr_submitresource` | 点击提交您的资源 |
| `resourceinfo_title` | 属性 |
| `resourceinfo_add_title` | 添加属性 |
| `resourceinfo_empty_msg` | 资源属性主要用于存储一些资源相关信息… |
| `resourceoptions_title` | （见 i18n.json `resourceoptions_title`） |
| `resourceoptions_add_btn` | 添加配置 |
| `resourceoptions_list_empty` | 可选配置是您的作品在节点展示/运行时… |
| `create_new_version_btn_moresetting` | 更多设置 |
| `create_new_version_btn_moresetting_help` | 为您的作品添加可选配置或依赖声明 |
| `create_new_version_btn_showless` | 收起 |
| `creatversion_property_msg_backendprocessing` | 属性正在解析... |
| `createversion_object_fromlocal` | 本地上传 |
| `createversion_object_fromstorage` | 存储空间 |
| `createversion_object_lastmodified` | 最近编辑时间 |
| `createversion_btn_edit` | 编辑 |

硬编码：取消上传、上传/更换视频封面、依赖未授权、草稿保存失败。

**源码对齐日期**: 2026-09-03
