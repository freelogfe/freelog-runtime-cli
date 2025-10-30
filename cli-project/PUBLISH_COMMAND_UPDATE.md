# 发布命令更新文档

## 更新时间
2025-10-30

## 更新概述
将旧版 Freelog CLI 的发布逻辑完整整合到新的 `publish` 命令中，使用正确的 Freelog API 端点和数据格式。

## 主要变更

### 1. 整合旧版发布逻辑

从 `packages/core/libs/index.js` 的发布命令中提取并整合了以下关键逻辑：
- 使用 `AdmZip` 进行文件压缩
- 正确的 Freelog API 端点
- 草稿和正式发布的不同数据结构
- 自定义属性的正确处理方式

### 2. 文件压缩 (AdmZip)

**旧逻辑**：
```javascript
const file = new AdmZip();
const pa = fs.readdirSync(buildPath);
pa.forEach(function (ele, index) {
  const info = fs.statSync(buildPath + path.sep + ele);
  if (info.isDirectory()) {
    file.addLocalFolder(buildPath + path.sep + ele, ele);
  } else {
    file.addLocalFile(buildPath + path.sep + ele);
  }
});
fs.writeFileSync(zipFile, file.toBuffer());
```

**新实现**：
```javascript
// 使用 AdmZip 压缩
const zip = new AdmZip();
const files = fs.readdirSync(buildPath);

files.forEach(file => {
  const filePath = path.join(buildPath, file);
  const stats = fs.statSync(filePath);
  
  if (stats.isDirectory()) {
    zip.addLocalFolder(filePath, file);
  } else {
    zip.addLocalFile(filePath);
  }
});

// 生成压缩文件
const zipFileName = `${config.name || 'resource'}.zip`;
publishFilePath = path.join(tempDir, zipFileName);
zip.writeZip(publishFilePath);
```

**改进点**：
- 使用 `path.join` 替代 `path.sep` 拼接，更安全
- 临时文件保存到统一的 `.freelog-cli/temp` 目录
- 自动清理临时文件

### 3. 文件上传

**API 端点**：
```
http://api.testfreelog.com/v2/storages/files/upload
```

**请求格式**：
```javascript
const formData = new FormData();
formData.append('file', fs.createReadStream(filePath));

await axios({
  url: 'http://api.testfreelog.com/v2/storages/files/upload',
  method: 'POST',
  data: formData,
  headers: {
    ...formData.getHeaders(),
    'Content-Length': contentLength,
    'authorization': auth.authorization || auth.token
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
});
```

**响应处理**：
```javascript
if (uploadResponse.data.errCode) {
  throw new Error(uploadResponse.data.msg || '文件上传失败');
}

const fileSha1 = uploadResponse.data.data.sha1;
```

### 4. 草稿发布

**API 端点**：
```
https://api.testfreelog.com/v2/resources/{workId}/versions/drafts
```

**数据格式**：
```javascript
{
  draftData: {
    versionInput: "1.0.0",
    selectedFileInfo: {
      name: "resource.zip",
      sha1: "abc123...",
      from: "上个版本"
    },
    additionalProperties: [],
    customProperties: [
      // readonlyText 类型的属性
      {
        type: "readonlyText",
        value: "...",
        description: "..."
      }
    ],
    customConfigurations: [
      // 其他类型的属性
      {
        type: "input",  // editableText 转换为 input
        input: "...",
        description: "...",
        select: []
      }
    ],
    directDependencies: [],
    baseUpcastResources: [],
    descriptionEditorInput: "版本描述"
  }
}
```

**自定义属性处理**：
```javascript
// 从 customPropertyDescriptors 分离为两类

// customProperties: readonlyText 类型
customProperties = config.customPropertyDescriptors
  .filter(item => item.type === 'readonlyText')
  .map(item => ({
    ...item,
    value: item.defaultValue,
    description: item.remark
  }));

// customConfigurations: 其他类型
customConfigurations = config.customPropertyDescriptors
  .filter(item => item.type !== 'readonlyText')
  .map(item => ({
    ...item,
    input: item.defaultValue,
    description: item.remark,
    select: item.candidateItems || [],
    type: item.type === 'editableText' ? 'input' : item.type
  }));
```

### 5. 正式发布

**API 端点**：
```
http://api.testfreelog.com/v2/resources/{workId}/versions
```

**数据格式**：
```javascript
{
  version: "1.0.0",
  filename: "resource.zip",
  fileSha1: "abc123...",
  description: "版本描述",
  baseUpcastResources: [],
  customPropertyDescriptors: [],
  dependencies: [],
  resolveResources: []
}
```

### 6. 认证处理

**使用加密后的 Token**：
```javascript
// 从认证模块获取已解密的 Token
const auth = requireAuth();

// 在请求中使用
headers: {
  'authorization': auth.authorization || auth.token
}
```

### 7. 配置文件支持

**支持的字段**：
- `workId` - 资源ID（必需）
- `name` - 项目名称
- `version` - 版本号
- `description` - 描述
- `publishPath` - 发布路径（优先）
- `local.buildDir` - 构建目录（备选）
- `dependencies` - 依赖列表
- `baseUpcastResources` - 基础上抛资源
- `customPropertyDescriptors` - 自定义属性描述
- `resolveResources` - 解决资源

## 完整发布流程

### 1. 前置检查
```bash
# 检查登录状态
requireAuth()

# 读取配置文件
readConfig('freelog.json')

# 验证配置
validateConfig(config)
```

### 2. 版本管理
```bash
# 交互式选择版本操作
- 保持当前版本
- 补丁版本递增 (patch)
- 次版本递增 (minor)
- 主版本递增 (major)
- 手动输入版本号

# 或使用命令行参数
freelog-cli publish --patch
freelog-cli publish --minor
freelog-cli publish --major
```

### 3. 文件打包
```bash
# 自动压缩构建目录
1. 读取 publishPath 或 local.buildDir
2. 使用 AdmZip 压缩
3. 保存到临时目录 ~/.freelog-cli/temp/
4. 标记需要清理
```

### 4. 文件验证
```bash
# 验证文件类型和大小
validateFileType(filePath)
validateFileSize(filePath)
```

### 5. 上传文件
```bash
# 上传到 Freelog 存储
POST http://api.testfreelog.com/v2/storages/files/upload
- 使用 FormData
- 显示上传进度
- 获取 fileSha1
```

### 6. 发布版本
```bash
# 草稿发布
POST https://api.testfreelog.com/v2/resources/{workId}/versions/drafts

# 正式发布
POST http://api.testfreelog.com/v2/resources/{workId}/versions
```

### 7. 清理临时文件
```bash
# 删除压缩包
fs.remove(publishFilePath)
```

## 使用示例

### 基本发布
```bash
# 发布到正式版本
freelog-cli publish

# 保存为草稿
freelog-cli publish --draft
freelog-cli publish -d
```

### 版本管理
```bash
# 自动递增补丁版本
freelog-cli publish --patch

# 自动递增次版本
freelog-cli publish --minor

# 自动递增主版本
freelog-cli publish --major

# 添加更新说明
freelog-cli publish --message "修复了一些bug"
freelog-cli publish -m "新增了XXX功能"
```

### 指定文件
```bash
# 使用已有的压缩包
freelog-cli publish --file ./dist/my-resource.zip

# 使用旧参数名（兼容）
freelog-cli publish --packagePath ./dist/my-resource.zip
```

### 配置文件
```bash
# 使用自定义配置文件
freelog-cli publish --config ./custom-freelog.json
```

## 配置文件示例

### 基本配置
```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "workId": "674d1d3d330631002f1018d8",
  "description": "我的主题",
  "publishPath": "dist",
  "dependencies": [],
  "customPropertyDescriptors": []
}
```

### 完整配置
```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "workId": "674d1d3d330631002f1018d8",
  "description": "我的主题",
  "publishPath": "dist",
  "dependencies": [
    {
      "resourceId": "dep-resource-id",
      "version": "^1.0.0"
    }
  ],
  "baseUpcastResources": [],
  "resolveResources": [],
  "customPropertyDescriptors": [
    {
      "key": "title",
      "name": "标题",
      "type": "readonlyText",
      "defaultValue": "默认标题",
      "remark": "页面标题"
    },
    {
      "key": "theme",
      "name": "主题颜色",
      "type": "editableText",
      "defaultValue": "#ffffff",
      "remark": "主题颜色设置",
      "candidateItems": ["#ffffff", "#000000"]
    }
  ]
}
```

## 错误处理

### 常见错误及解决方案

#### 1. 未登录
```
错误: 未登录，请先执行登录命令
解决: freelog-cli login
```

#### 2. workId 不存在
```
错误: workId 不存在，请检查 freelog.json 配置文件
解决: 在 freelog.json 中添加 workId 字段
```

#### 3. 构建目录不存在
```
错误: 构建目录不存在: /path/to/dist
解决: 先执行构建命令生成 dist 目录
```

#### 4. 文件上传失败
```
错误: 文件上传失败
可能原因:
- 网络问题
- Token 过期
- 文件过大
解决: 检查网络，重新登录，或减小文件大小
```

#### 5. 发布失败
```
错误: API 错误: xxx
解决: 根据错误信息检查配置文件格式
```

## 与旧版差异

| 特性 | 旧版 | 新版 |
|------|------|------|
| 压缩方式 | AdmZip | AdmZip (保持) |
| 临时文件 | 项目根目录 | ~/.freelog-cli/temp/ |
| 登录检查 | fs.readFile 手动读取 | requireAuth() 自动解密 |
| Token 使用 | 手动读取 JSON | 自动解密后使用 |
| 错误处理 | log.error | 统一错误处理 + 日志 |
| 进度显示 | 简单 log | ora spinner |
| 配置读取 | fs.readFile | readConfig() 模块化 |
| 版本管理 | 无自动递增 | 支持自动递增 |
| 文件验证 | 无 | 文件类型和大小验证 |
| 清理机制 | 无 | 自动清理临时文件 |

## 测试建议

### 1. 草稿发布测试
```bash
# 准备测试项目
cd test-project
npm run build

# 发布草稿
freelog-cli publish --draft

# 验证草稿
# 在 Freelog 平台查看草稿是否正确保存
```

### 2. 正式发布测试
```bash
# 发布正式版本
freelog-cli publish --patch -m "测试发布"

# 验证发布
# 在 Freelog 平台查看版本是否正确发布
```

### 3. 自定义属性测试
```json
// freelog.json
{
  "customPropertyDescriptors": [
    {
      "key": "test1",
      "type": "readonlyText",
      "defaultValue": "test value",
      "remark": "测试属性"
    },
    {
      "key": "test2",
      "type": "editableText",
      "defaultValue": "editable",
      "remark": "可编辑属性",
      "candidateItems": ["option1", "option2"]
    }
  ]
}
```

```bash
# 发布草稿并验证自定义属性格式
freelog-cli publish --draft
```

### 4. Token 加密测试
```bash
# 登录后发布（验证 Token 自动解密）
freelog-cli login
freelog-cli publish --draft
```

## 注意事项

1. **workId 必需**: 发布前必须在 `freelog.json` 中配置 `workId`
2. **构建目录**: 确保在发布前执行构建命令
3. **文件大小**: 注意文件大小限制（默认 100MB）
4. **Token 有效期**: Token 默认 30 天有效期，过期需重新登录
5. **API 端点**: 草稿使用 `https://`，正式使用 `http://`（根据实际情况）
6. **自定义属性**: 注意区分 `readonlyText` 和其他类型的处理方式

## 后续优化建议

1. **分片上传**: 对大文件支持分片上传
2. **断点续传**: 上传失败后支持断点续传
3. **版本对比**: 发布前显示本地和远程版本对比
4. **回滚功能**: 支持快速回滚到上一版本
5. **批量发布**: 支持一次发布多个资源
6. **发布模板**: 支持保存和使用发布配置模板

## 相关文件

- `cli-project/src/commands/publish/index.js` - 发布命令实现
- `cli-project/src/core/auth.js` - 认证模块（Token 加密/解密）
- `cli-project/src/core/config.js` - 配置管理
- `cli-project/src/utils/file.js` - 文件工具
- `cli-project/src/utils/spinner.js` - 进度显示

## 更新日志

- **2025-10-30**: 整合旧版发布逻辑到新命令
- **2025-10-30**: 实现 AdmZip 文件压缩
- **2025-10-30**: 集成正确的 Freelog API 端点和数据格式
- **2025-10-30**: 实现草稿和正式发布的不同逻辑
- **2025-10-30**: 添加自定义属性的正确处理方式

---

**更新人员**: AI Assistant  
**版本**: v1.0.0

