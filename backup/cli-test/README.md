# abc

一个 Freelog 主题

## 项目信息

- 资源 ID: 未创建（使用 `freelog-cli2 create` 创建）
- 资源名称: `abc`
- 版本号: `1.0.0`


## 配置文件

项目使用两个配置文件：

- `freelog.resource.config.js` - 资源信息（资源 ID、类型、介绍等）
- `freelog.version.config.js` - 版本信息（版本号、依赖、文件等）

## 开发

```bash
# 安装依赖
npm install

# 开发
npm run dev

# 构建
npm run build
```

## Freelog CLI 命令

### 依赖管理
```bash
# 添加依赖
freelog-cli dep add <resourceId>

# 查看依赖列表
freelog-cli dep list

# 同步依赖版本
freelog-cli dep sync
```

### 发布
```bash
# 发布正式版本
freelog-cli publish

# 发布草稿
freelog-cli publish --draft
```

### 资源管理
```bash
# 更新资源信息
freelog-cli update --intro "新的介绍"

# 同步资源和版本信息
freelog-cli sync
```
