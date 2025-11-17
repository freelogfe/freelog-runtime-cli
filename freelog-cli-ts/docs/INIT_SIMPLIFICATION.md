# Init 命令简化 - initResource 不调用 API

## 变更说明

`initResource.ts` 简化为仅创建本地配置文件，不再调用 Freelog API 创建资源。

## 修改文件

### 1. `initResource.ts` - 简化逻辑

**移除的功能：**
- ❌ 调用 `createResource` API
- ❌ 获取资源类型输入
- ❌ 获取版本号输入
- ❌ 自动创建 Freelog 资源

**保留的功能：**
- ✅ 格式化项目名称
- ✅ 获取资源名称（可选）
- ✅ 生成 `freelog.config.json`
- ✅ 生成 `README.md`

**生成的配置文件示例：**
```json
{
  "$schema": "../freelog.schema.json",
  "resourceId": "",           // 空值，需用户手动填写
  "resourceName": "",         // 用户输入或空
  "resourceType": "",         // 空值，需用户手动填写
  "buildPath": "dist",
  "version": "1.0.0",
  "fileSha1": "",
  "filename": "",
  "description": "",
  "dependencies": [],
  "customPropertyDescriptors": [],
  "baseUpcastResources": []
}
```

### 2. `init.ts` - 调整登录验证

**变更：**
- 移除全局登录验证
- 仅在模板初始化时验证登录

**原代码：**
```typescript
// 确保已登录
requireAuth();

// 获取初始化类型
const initType = await getInitType();

// 路由
if (initType === TYPE_OTHER) {
  await executeInitResource(projectName);
} else {
  await executeInitTemplate(initType);
}
```

**新代码：**
```typescript
// 获取初始化类型
const initType = await getInitType();

// 路由
if (initType === TYPE_OTHER) {
  // 其余资源类型：不需要登录
  await executeInitResource(projectName);
} else {
  // 主题/插件/前端库：在 executeInitTemplate 内部验证登录
  await executeInitTemplate(initType);
}
```

### 3. `initTemplate.ts` - 添加登录验证

**变更：**
在函数开始处添加登录验证

```typescript
export async function executeInitTemplate(initType: string): Promise<void> {
  console.log(chalk.blue(`\nℹ 初始化类型: ${initType}\n`));

  // 确保已登录（需要调用 API 创建资源）
  requireAuth();

  // ... 后续逻辑
}
```

## 用户体验对比

### 模板初始化（主题/插件/前端库）

```bash
$ freelog-cli init
? 请选择初始化类型 主题
# ← 此时检查登录状态
? 请输入主题名称 my-theme
? 请输入版本号 1.0.0
✔ Freelog 资源创建成功: 60a1234567890abcdef12345
✔ 项目初始化成功
ℹ 配置文件: freelog.config.js
ℹ 资源 ID: 60a1234567890abcdef12345

ℹ 下一步:
  $ freelog-cli dep add <resourceId>  # 添加依赖
  $ freelog-cli publish               # 发布
```

**特点：**
- ✅ 自动创建资源
- ✅ 自动填写 resourceId
- ✅ 可以立即使用

### 资源初始化（其他资源）

```bash
$ freelog-cli init
? 请选择初始化类型 其余资源
# ← 不检查登录状态
? 请输入项目名称 my-resource
? 请输入资源名称（可选，稍后可在配置文件中修改） My Resource
✔ 配置文件创建成功
ℹ 配置文件: freelog.config.json

💡 提示: 请在配置文件中填写资源信息（resourceId、resourceName、resourceType 等）

ℹ 下一步:
  1. 在 Freelog 平台创建资源，获取 resourceId
  2. 在 freelog.config.json 中填写资源信息
  3. 执行 freelog-cli publish 发布资源
```

**特点：**
- ❌ 不创建资源
- ❌ 不填写 resourceId
- 💡 提示用户手动完成配置

## 设计理由

### 为什么其他资源不自动创建？

1. **灵活性** - 其他资源类型多样（图片、视频、文档等），需要用户在平台根据具体情况创建

2. **离线使用** - 允许在没有网络或未登录的情况下初始化项目

3. **简化流程** - 避免询问过多问题（资源类型、版本号等），让用户专注于配置文件

4. **明确分工**：
   - **模板类型**（主题/插件/前端库）→ 复杂，需要完整的项目结构和资源，CLI 自动创建
   - **其他资源** → 简单，仅需配置文件，用户手动创建资源后填写配置

## 工作流程

### 模板初始化工作流程

```
用户执行 init
    ↓
选择模板类型
    ↓
验证登录 ← requireAuth()
    ↓
输入项目信息
    ↓
调用 API 创建资源
    ↓
生成配置文件（含 resourceId）
    ↓
完成（可直接使用）
```

### 资源初始化工作流程

```
用户执行 init
    ↓
选择其他资源
    ↓
输入项目名称
    ↓
生成配置文件（空 resourceId）
    ↓
用户手动操作：
  1. 登录 Freelog 平台
  2. 创建资源
  3. 复制 resourceId
  4. 填写配置文件
    ↓
完成（可发布）
```

## 登录验证位置

| 文件 | 登录验证 | 原因 |
|------|---------|------|
| `init.ts` | ❌ 无 | 主入口，只负责路由 |
| `initTemplate.ts` | ✅ 有 | 需要调用 API 创建资源 |
| `initResource.ts` | ❌ 无 | 不调用 API，仅创建本地文件 |

## 优势

1. **更好的离线体验** - 其他资源可以离线初始化
2. **更清晰的职责** - 模板初始化负责完整流程，资源初始化只负责配置
3. **更灵活的使用** - 用户可以先创建配置，稍后再创建资源
4. **减少 API 调用** - 不为不确定的资源类型创建资源

## 总结

通过这次简化：

- ✅ `initResource` 更轻量，只做配置文件生成
- ✅ `initTemplate` 保持完整功能，自动创建资源
- ✅ 登录验证按需进行，提升用户体验
- ✅ 职责更清晰，易于维护

这种设计更符合实际使用场景：模板类型需要完整的自动化流程，而其他资源类型更适合手动控制。

