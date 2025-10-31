# Freelog CLI

> 专业的 Freelog 作品开发与发布工具

[![完成度](https://img.shields.io/badge/完成度-93%25-brightgreen)]() [![文档](https://img.shields.io/badge/文档-6个-blue)]()

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
- 💰 **支付功能** - 自动签约支付，密码掩码
- 📤 **发布管理** - 草稿/正式发布
- 🔄 **信息同步** - 同步资源信息

---

## 主要命令

```bash
# 认证
freelog-cli login [-g]              # 登录
freelog-cli status                  # 状态

# 依赖（支持 -sv 选择版本）
freelog-cli add <resource> [-sv]    # 添加
freelog-cli change <resource> [-sv] # 修改
freelog-cli update <res...> [-sv]   # 更新
freelog-cli remove <res...>         # 删除

# 发布
freelog-cli publish [-d]            # 发布
```

---

## 版本选择 🆕

```bash
$ freelog-cli add my-resource -sv

? 请选择版本:
❯ 2.0.0 (最新版本) - 2025-10-30
  1.5.0 - 2025-10-15
  取消选择
```

---

## 📚 文档

**核心文档 (6个)**:

- 🚀 [快速开始](./docs/guide/QUICK_START.md) - 5分钟上手
- 📦 [依赖管理](./docs/features/DEPENDENCY.md) - 完整用法
- 🎯 [版本选择](./docs/features/VERSION_SELECTOR.md) - 交互选择
- 🇨🇳 [中文手册](./docs/zh-CN/USER_GUIDE.md) - 完整中文文档

**查看全部**: [docs/](./docs/)

---

## 项目状态

- **完成度**: 93% (13/14 命令)
- **代码质量**: ✅ 零 Linter 错误
- **文档**: 6 个精简文档
- **状态**: ✅ 可用于生产

详见 [PROJECT_STATUS.md](./PROJECT_STATUS.md)

---

## License

MIT
