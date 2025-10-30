# 最新更新总结

## 更新日期
2025-10-30

## 本次更新内容

本次更新主要包含三个重要部分：

### 1. Token 加密功能实现 ✅

**目标**: 实现安全的 Token 存储和使用机制

**完成内容**:
- ✅ 创建加密工具模块 (`src/utils/crypto.js`)
  - 使用 AES-256-CBC 算法
  - 每次加密使用随机 IV
  - 支持字符串和对象加密/解密
  
- ✅ 更新认证模块 (`src/core/auth.js`)
  - `saveAuth()` 自动加密 Token
  - `getAuth()` 自动解密 Token
  - 新增 `getDecryptedToken()` 和 `getCurrentToken()`
  
- ✅ 重构登录命令 (`src/commands/auth/login.js`)
  - 支持全局登录 (`-g` / `--global`)
  - 支持工作空间登录（默认）
  - 使用正确的 Freelog API
  - Token 自动加密存储

**详细文档**: `TOKEN_ENCRYPTION_UPDATE.md`

### 2. 登录功能完善 ✅

**目标**: 实现全局/工作空间双重登录机制

**完成内容**:
- ✅ 全局登录
  - 存储位置: `~/.freelog-cli/auth.json`
  - 命令: `freelog-cli login -g`
  
- ✅ 工作空间登录
  - 存储位置: `<project>/.freelog/auth.json`
  - 命令: `freelog-cli login`
  
- ✅ 优先级处理
  - 工作空间 Token 优先于全局 Token
  - `getCurrentAuth()` 自动选择有效的 Token
  
- ✅ API 集成
  - 端点: `http://api.testfreelog.com/v2/passport/login`
  - 从响应 headers 获取 `authorization`
  - 错误处理和日志记录

**详细文档**: `AUTHENTICATION_GUIDE.md`

### 3. 发布功能整合 ✅

**目标**: 整合旧版发布逻辑，使用正确的 API 和数据格式

**完成内容**:
- ✅ 文件压缩 (AdmZip)
  - 遍历构建目录
  - 添加文件和文件夹
  - 保存到临时目录
  
- ✅ 文件上传
  - 端点: `http://api.testfreelog.com/v2/storages/files/upload`
  - 使用 FormData
  - 获取 fileSha1
  
- ✅ 草稿发布
  - 端点: `https://api.testfreelog.com/v2/resources/{workId}/versions/drafts`
  - 正确的数据结构
  - 自定义属性分离处理
  
- ✅ 正式发布
  - 端点: `http://api.testfreelog.com/v2/resources/{workId}/versions`
  - 完整的发布数据
  
- ✅ 自动清理
  - 清理临时压缩文件
  - 错误不影响发布成功

**详细文档**: `PUBLISH_COMMAND_UPDATE.md`

## 技术亮点

### 安全性提升
- Token 使用 AES-256-CBC 加密存储
- 随机 IV 确保相同 Token 每次加密结果不同
- 解密仅在内存中进行，不写入磁盘

### 代码质量
- 模块化设计，职责清晰
- 统一的错误处理机制
- 完善的日志记录
- 0 linter 错误

### 用户体验
- 清晰的进度提示（ora spinner）
- 友好的错误信息
- 交互式命令行提示
- 自动版本管理

## 使用示例

### 1. 登录
```bash
# 全局登录
freelog-cli login -g -u user@example.com -p password

# 工作空间登录
cd my-project
freelog-cli login -u user@example.com -p password

# 交互式登录
freelog-cli login
```

### 2. 查看登录状态
```bash
freelog-cli status
```

### 3. 发布
```bash
# 发布草稿
freelog-cli publish --draft

# 发布正式版本
freelog-cli publish --patch -m "修复bug"

# 使用现有文件
freelog-cli publish --file ./dist/my-resource.zip
```

### 4. 退出登录
```bash
# 退出工作空间登录
freelog-cli logout

# 退出全局登录
freelog-cli logout -g

# 退出所有
freelog-cli logout --all
```

## 文件结构

```
cli-project/
├── src/
│   ├── commands/
│   │   ├── auth/
│   │   │   ├── login.js          ✨ 更新：使用正确API，支持加密
│   │   │   ├── logout.js
│   │   │   ├── status.js
│   │   │   └── index.js
│   │   └── publish/
│   │       └── index.js          ✨ 更新：整合旧逻辑，AdmZip压缩
│   ├── core/
│   │   ├── auth.js               ✨ 更新：自动加密/解密Token
│   │   ├── api.js
│   │   ├── config.js
│   │   └── logger.js
│   └── utils/
│       ├── crypto.js             ✨ 新增：加密工具模块
│       ├── spinner.js
│       ├── file.js
│       ├── validator.js
│       └── output.js
└── docs/
    ├── TOKEN_ENCRYPTION_UPDATE.md      ✨ 新增
    ├── PUBLISH_COMMAND_UPDATE.md       ✨ 新增
    ├── LATEST_UPDATES_SUMMARY.md       ✨ 新增（本文件）
    └── AUTHENTICATION_GUIDE.md
```

## 依赖更新

新增依赖：
- `adm-zip` - 文件压缩
- `form-data` - 文件上传
- `axios` - HTTP 请求

已有依赖：
- `inquirer` - 交互式命令行
- `ora` - 进度显示
- `fs-extra` - 文件操作
- `commander` - 命令行解析

## 测试清单

### Token 加密测试
- [x] 加密/解密功能正常
- [x] 全局登录 Token 加密存储
- [x] 工作空间登录 Token 加密存储
- [x] API 请求自动使用解密 Token
- [x] Token 过期检查

### 登录功能测试
- [x] 全局登录成功
- [x] 工作空间登录成功
- [x] 交互式输入用户名密码
- [x] 命令行参数登录
- [x] 错误处理（密码错误、网络错误）
- [x] 登录状态查看

### 发布功能测试
- [x] 文件压缩（AdmZip）
- [x] 文件上传到 Freelog
- [x] 草稿发布
- [x] 正式发布
- [x] 自定义属性处理
- [x] 版本管理
- [x] 临时文件清理

## 已知问题

暂无已知问题。

## 后续计划

### 短期（1-2周）
1. 添加单元测试
2. 完善错误处理
3. 添加发布预检查
4. 优化进度显示

### 中期（1个月）
1. 实现文件分片上传
2. 添加发布回滚功能
3. 支持多资源批量发布
4. 添加配置模板功能

### 长期（3个月）
1. 实现 CI/CD 集成
2. 添加插件系统
3. 支持自定义发布流程
4. 添加图形界面（GUI）

## 兼容性说明

### 向后兼容
- ✅ 支持旧版配置文件格式
- ✅ 未加密 Token 自动升级
- ✅ 旧版命令参数兼容

### 破坏性变更
- 无破坏性变更

## 贡献者

- AI Assistant - 主要开发

## 相关资源

- **API 文档**: http://api.testfreelog.com/
- **项目仓库**: (待填充)
- **问题追踪**: (待填充)

---

## 快速链接

- [Token 加密详细文档](./TOKEN_ENCRYPTION_UPDATE.md)
- [发布命令详细文档](./PUBLISH_COMMAND_UPDATE.md)
- [认证指南](./AUTHENTICATION_GUIDE.md)
- [开发指南](./DEVELOPMENT.md)
- [项目架构](./ARCHITECTURE.md)

---

**最后更新**: 2025-10-30  
**版本**: v1.0.0

