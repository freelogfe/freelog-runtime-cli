# 版本选择功能

## 概述

使用 `-sv` 或 `--select-version` 参数可以交互式选择资源版本。

---

## 支持命令

```bash
freelog-cli add <resource> -sv
freelog-cli change <resource> -sv
freelog-cli update <resources...> -sv
```

---

## 使用示例

### 添加依赖时选择版本

```bash
$ freelog-cli add my-resource -sv

⠋ 正在获取版本列表...
✓ 找到 5 个版本

? 请选择版本: (Use arrow keys)
❯ 2.0.0 (最新版本) - 2025-10-30 - 重大更新
  1.5.0 - 2025-10-15 - 修复问题  
  1.0.0 - 2025-10-01 - 首个版本
  取消选择

✓ 已选择版本: 2.0.0
```

### 更新依赖时选择版本

```bash
$ freelog-cli update my-resource -sv

ℹ 当前版本: 1.0.0

? 请选择版本: 2.0.0 (最新版本)
? 确认更新版本? (1.0.0 -> 2.0.0) Yes

✓ 版本已更新: 2.0.0
```

---

## 版本信息显示

每个版本显示：
- **版本号**: 如 `2.0.0`
- **标注**: 最新版本标注 `(最新版本)`
- **日期**: 创建时间
- **描述**: 版本说明（如有）

---

## 取消操作

选择 "取消选择" 会立即退出，不会保存任何更改。

---

## API 接口

**端点**: `GET /v2/resources/versions/list`

**参数**:
```javascript
{
  resourceId: "资源ID",
  projection: "version,createDate,description"
}
```

**文档**: [查看资源版本列表](https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E5%88%97%E8%A1%A8.html)

---

## 相关文档
- [依赖管理](./DEPENDENCY.md)

