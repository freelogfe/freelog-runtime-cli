# PHASE - Phase 专项设计层

> **用途**: 技术实现计划，编排业务梳理中的 Step  
> **版本**: v1.0 | **最后更新**: 2026-09-02

---

## 📋 **一、为什么在这里？**

PHASE 是**我的 Phase 专项设计**,不是 Console 业务流程，而是**CLI 实现的编排逻辑**。它负责将业务梳理中的"Step"按 Phase 组织成可执行的发布流程。

---

## 📚 **二、内容清单**

### **P0-Phase-0 认证系统** (P0-Phase-0 认证系统.md)
- 登录/登出/Token 刷新
- Workspace/Global/Ephemeral 存储策略
- Multi-Account 管理

### **P1-Phase-1 工程模式** (P1-Phase-1 工程模式.md)
- Manifest.yaml 读取与验证
- Checkpoint 编排流程
- Draft 机制替代方案

### **P2-Phase-2 发行流程** (P2-Phase-2 发行流程.md)
- F1 单资源发布 Step 调度
- M1 版本更新 Step 调度
- C1 合集创建 Step 调度

### **P3-Phase-3 资源维护** (P3-Phase-3 资源维护.md)
- M2~M4 属性描述更新调度
- M5 授权策略管理调度

### **P4-Phase-4 批量发布** (P4-Phase-4 批量发布.md)
- F2.1 单资源批量并发控制
- Semaphore 并发调度
- Batch Publish Report 生成

### **P5-Phase-5 合集管理** (P5-Phase-5 合集管理.md)
- C2 RSS 自动收录
- C3 合集 CRUD 编排
- Policy Inheritance 策略继承

---

## 🔗 **三、与其他层级关系**

| 层级 | 职责 | 数据来源 | 输出 |
|------|------|----------|------|
| **业务梳理/** | Console 业务流程 | Console 源码 | Step 定义 |
| **PHASE/** | Step 编排器 | 业务梳理的 Step | CLI 执行计划 |
| **ARCHITECTURE/** | 技术约束 | CLI 需求 | API 契约 |

---

## 💡 **四、使用说明**

### **何时阅读？**
- ✅ 编写发布脚本前 → 看 **PHASE/P2**
- ✅ 实现资源维护功能 → 看 **PHASE/P3**
- ✅ 开发批量命令 → 看 **PHASE/P4**
- ✅ 对照业务梳理 → 同时看 **业务梳理/流程设计**

---

## 🎯 **五、核心设计理念**

### **1. Phase 分层模型**
```
P0 (认证) → P1 (工程) → P2(发行) → P3(维护) → P4(批量) → P5(合集)
```

### **2. Step 复用原则**
- 同一个 Step 可在多个 Phase 中被调用
- Step 定义来自**业务梳理/**
- Phase 负责编排顺序和错误处理

---

**📌 下一步**: 查看 [ARCHITECTURE/README.md](./ARCHITECTURE/README.md) 了解技术约束
