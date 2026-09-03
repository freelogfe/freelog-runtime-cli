# Freelog Runtime CLI - Console 对齐核查清单

> **文档角色**: 跟踪所有业务梳理文件与 Console 源码的核对进度  
> **核心目标**: 确保业务梳理文档 100% 字段约束准确  
> 最后更新：2026-09-03

---

## 📊 **核对进度总览**

| # | 业务梳理文件 | Console 源码路径 | 状态 | 错误数 | 备注 |
|---|-------------|-----------------|------|--------|------|
| ✅ | F0-1 Step1 | creator/Step1/index.tsx | ❌ 发现错误 | 2+ | 标题长度 200→100, authId 细节 |
| ⬜ | F0-2 Step2 | creator/Step2/index.tsx | 🔴 待核对 | TBD | ~1063 行 |
| ⬜ | F0-3 Step3 | creator/Step3/index.tsx | 🔴 待核对 | TBD | ~228 行 |
| ⬜ | F0-4 Step4 | creator/Step4/index.tsx | 🔴 待核对 | TBD | ~91 行 |
| ✅ | M0-1 版本更新 | versionCreator/$id/index.tsx | ✅ 已核对 | 0 | 无问题 |
| ✅ | M0-2 属性更新 | sidebar/info/$id/index.tsx | ❌ 已修正 | 2 | 标题长度 + 描述限制错误 |
| ✅ | M0-3 策略管理 | sidebar/policy/$id/index.tsx | ❌ 已重写 | 0 | 已精简至 221 行 |
| ⬜ | F1-1 批量发布 | creatorBatch/*.tsx | 🔴 待核对 | TBD | P0 |
| ⬜ | C0-1 Step1 | collectionCreator/Step1/index.tsx | 🔴 待核对 | TBD | 311 行 |
| ✅ | C0-2 Step2 | collectionCreator/Step2/index.tsx | ❌ 已重写 | 7 | 虚构字段全部移除 |
| ⬜ | C0-3 Step3 | collectionCreator/Step3/index.tsx | 🔴 待核对 | TBD | ~145 行 |
| ⬜ | C0-4 Step4 | collectionCreator/Step4/index.tsx | 🔴 待核对 | TBD | RSS 绑定复杂 |
| ⬜ | C0-5 Step5 | collectionCreator/Step5/index.tsx | 🔴 待核对 | TBD | TBD |
| ⬜ | C2-合集管理 (4 文件) | collectionDetails/* | 🔴 待核对 | TBD | P2 |

---

## 🎯 **优先级说明**

### 🔴 P0 高危害风险 (优先处理)
已完成:
- ✅ **C0-2 Step2** - 已重写，移除 7 个虚构字段
- ✅ **M0-2** - 已修正标题长度 + 描述限制错误
- ✅ **M0-3** - 已重写精简

待处理:
- F1-1 批量发布总纲
- F0-1 Step1 补充核对

### 🟡 P1 中等风险
- F0-3, F0-4 - 创建资源后两步
- C0-1~C0-5 (除 C0-2 外) - 合集创建流程

### 🟢 P2 低风险
- C2-合集管理 (4 个文件) - 后续维护功能

---

## 📝 **使用说明**

1. 每核对完一个文件，立即更新此表格的状态
2. 发现问题直接在对应文档中添加 Console 证据注释并修正
3. 大文档拆分，小文档合并，保持简洁
4. 完成后将所有状态改为"✅ 已核对"

---

## ✅ **已完成的修正记录**

### **C0-2 Step2 (392 行)**
- ❌ **原问题**: 虚构了标题/描述/封面上传字段
- ✅ **已修正**: 
  - 移除所有虚构元数据表单内容
  - 补充真实的单品管理逻辑 (FCollectionItems2)
  - 添加展示样式配置 (CollectionSetting)
  - 增加自定义属性编辑 (FAttrsAndConfigs)
  - 补充 RSS 绑定流程 (FPodcastRssSubmit)
  - 增加排序管理、依赖授权等模块
- **Console 证据**: collectionCreator/Step2/index.tsx L1-L1426

### **M0-2 属性更新 (268 行)**
- ❌ **原问题**: 
  - 标题长度误写为 200(应为 100)
  - 描述的 50-1000 字符限制不存在
  - 标签 max=10 是猜测的
- ✅ **已修正**:
  - 标题 maxLength 改为 100(L267 lengthLimit={100})
  - 删除描述的 50-1000 限制
  - 删除标签 maxTags=10 限制
  - 补充资源授权标识 (resourceName) 字段说明
- **Console 证据**: sidebar/info/$id/index.tsx L1-L492

### **M0-3 策略管理 (221 行)**
- ❌ **原问题**: 缺少策略编辑器细节、缓存机制未说明
- ✅ **已修正**:
  - 补充策略列表/模板/切换逻辑
  - 添加空状态引导文案
  - 增加生命周期管理说明
  - 标注免费策略限定原则
- **Console 证据**: sidebar/policy/$id/index.tsx L1-L201

---

**预计耗时**: 持续进行中  
**当前进度**: 已完成 6/17 = 35%, 剩余 11 个文件
