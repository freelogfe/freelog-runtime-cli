# aaaaaa

一个 Freelog 资源项目

## 项目信息

- 资源名称: `aaaaaa`
- 版本号: `1.0.0`

## 配置文件

项目使用两个配置文件：

- `freelog.resource.config.js` - 资源信息（资源 ID、类型、介绍等）
- `freelog.version.config.js` - 版本信息（版本号、依赖、文件等）

### 配置文件说明

#### freelog.resource.config.js
- `resourceId` - 资源 ID（创建资源后获得）
- `resourceName` - 资源名称
- `resourceType` - 资源类型（数组）
- `intro` - 资源介绍
- `coverImages` - 封面图 URL 列表

#### freelog.version.config.js
- `version` - 版本号
- `fileSha1` - 文件 SHA1 值
- `filename` - 文件名
- `description` - 版本描述
- `dependencies` - 依赖列表
- `baseUpcastResources` - 上抛资源列表

## Freelog CLI 命令

### 创建资源
```bash
# 在 Freelog 平台创建资源
freelog-cli create
```

### 发布版本
```bash
# 发布正式版本
freelog-cli publish
```

### 同步信息
```bash
# 同步资源和版本信息
freelog-cli sync
```

### 更新资源
```bash
# 更新资源介绍
freelog-cli update --intro "新的介绍"
```
