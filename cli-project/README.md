# Freelog CLI

> 专业的 Freelog 作品开发与发布工具

[![完成度](https://img.shields.io/badge/完成度-93%25-brightgreen)]() [![文档](https://img.shields.io/badge/文档-3个-blue)]()

---

## 快速开始

```bash
# 安装
npm install -g @freelog/cli

# 登录
freelog-cli login -g

# 添加依赖（交互式选择版本）
freelog-cli add my-resource -sv

# 发布
freelog-cli publish
```

---

## 核心功能

- 🔐 **认证管理** - 全局/工作空间登录，Token加密
- 📦 **依赖管理** - add/change/update/remove
- 🎯 **版本选择** - 交互式选择版本 `-sv` 🆕
- 💰 **支付功能** - 自动签约支付
- 📤 **发布管理** - 草稿/正式发布
- 🔄 **信息同步** - 同步资源信息

---

## 主要命令

```bash
# 认证
login [-g]              # 登录（-g 全局）
status                  # 查看状态

# 依赖（支持 -sv 选择版本）
add <resource> [-sv]    # 添加
change <resource> [-sv] # 修改
update <res...> [-sv]   # 更新
remove <res...>         # 删除

# 发布
publish [-d]            # 发布（-d 草稿）
```

---

## 📚 文档（仅3个）

1. **[快速开始](./docs/QUICK_START.md)** - 安装、认证、基本用法
2. **[依赖管理](./docs/DEPENDENCY.md)** - 完整的依赖管理 + 版本选择
3. **[架构说明](./docs/ARCHITECTURE.md)** - 项目结构 + API + 扩展

**中文**: [完整使用手册](./docs/zh-CN/USER_GUIDE.md)

---

## 项目状态

- ✅ **完成度**: 93% (13/14 命令)
- ✅ **代码质量**: 零 Linter 错误
- ✅ **文档**: 3 个精简文档
- ✅ **可用于生产**

详见 [PROJECT_STATUS.md](./PROJECT_STATUS.md)

---

## License

MIT
