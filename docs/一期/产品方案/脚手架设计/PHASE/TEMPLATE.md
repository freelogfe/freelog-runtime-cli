# PHASE 文档标准模板

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **用途**: 为所有 PHASE 文档提供统一的写作格式和质量标准

---

## 📄 **文档结构规范**

每个 PHASE 文档必须严格按照以下章节组织：

```markdown
# F0 - 单资源发布完整流程

## 1. CLI 命令入口
   1.1 TTY Interactive Mode (ASCII Diagram)
   1.2 Non-interactive Mode (--flag syntax)

## 2. Step 编排流程
   2.1 Step Flow Diagram (ASCII)
   2.2 Checkpoint Save Points Definition

## 3. Step 详细设计（每个 Step 独立章节）
   ### Step N: [功能名称]
   3.N.1 功能目标与复用模块声明
   3.N.2 TTY Interactive Flow (ASCII Diagram)
   3.N.3 字段约束表（来源标注）
   3.N.4 tools-lib API 调用表
   3.N.5 If-then-else 伪代码
   3.N.6 错误码映射表

## 4. 异常处理矩阵
   | 场景 | 前置条件 | CLI 行为 | 用户提示 | 恢复建议 |

## 5. 验收测试用例
   | Case ID | 测试场景 | 预期结果 | 对应 Step |
```

---

## ✅ **质量检查清单**

每份 PHASE 文档完成后必须自检：

### **基础要求**
- [ ] 全程中文撰写（无英文术语混用，除必要技术名词）
- [ ] 无任何 TypeScript/JavaScript 代码片段
- [ ] 文档长度控制在 600 行以内

### **内容完整性**
- [ ] 是否有 TTY ASCII Diagram（每个交互步骤）？
- [ ] 字段约束是否注明来源（如 `来源：P0-F0-Phase1`）？
- [ ] 是否声明了复用的模块（FRAMEWORK/G2/G3/POLICY）？
- [ ] 是否写了 If-then-else 伪代码而非真实代码？
- [ ] 是否列出了错误码映射表？
- [ ] 是否有验收测试用例（至少 3 个）？

### **交叉引用**
- [ ] PHASE 引用的框架能力是否在 ARCHITECTURE 中有定义？
- [ ] 字段约束是否与业务梳理验证结果一致？
- [ ] 命令入口是否符合 DESIGN.md 的产品定位？

---

## 📝 **写作示例**

### **Step 详细设计示例**

#### **Step2: 压缩并上传资源包**

##### **3.2.1 功能目标与复用模块声明**

| 项目 | 说明 |
|------|------|
| **功能目标** | 调用框架层压缩工具生成 artifact.zip，并通过 G2-UPLOAD 服务上传到平台 |
| **复用模块** | FRAMEWORK(压缩打包工具), G2-UPLOAD(文件上传服务), G3-CHECKPOINT(断点续传) |
| **输入** | 用户指定的本地文件夹路径 |
| **输出** | `{fileId, fileUrl, sha1}` |

---

##### **3.2.2 TTY Interactive Flow (ASCII Diagram)**

```bash
┌─ Step2/5: 压缩并上传资源包 ───────────┐
│                                        │
│ ▶ 调用框架压缩工具                       │
│   freelog build --dir ./my-theme      │
│                                        │
│ 📦 自动生成：artifact.zip               │
│   ├── Size:      5,456,789 bytes       │
│   ├── MIME:      application/zip       │
│   ├── SHA1:      a1b2c3d...e4f5g      │
│   └── Source:    ./my-theme/*          │
│           ▲                            │
│           └─ 应用 .freelogignore 规则     │
│                                        │
│ ⚙️ 自动解析属性                          │
│   ✓ version: 1.0.0                     │
│   ✓ author: liu-kai-github             │
│   ✓ main: index.js                     │
│   ✓ description: 简短描述              │
│           ▲                            │
│           └─ from manifest.yaml         │
│                                        │
│ ⬆️ 开始上传 → G2-UPLOAD                  │
│   ████████████░░░░░░ 67%               │
│   Speed: 2.5MB/s | ETA: 12s            │
│                                        │
│ ✅ 上传完成！                            │
│   FileID: FL-20260903-abc123           │
│   URL: https://cdn.freelog.com/...     │
└────────────────────────────────────────┘
```

---

##### **3.2.3 字段约束表**

| 字段 | 长度/格式约束 | 来源 | 备注 |
|------|-------------|------|------|
| 文件大小 | <50MB（单片模式） | Platform API | >50MB 自动切换分片模式 |
| 压缩格式 | ZIP（字节级确定性） | CLI 框架规范 | 条目排序、时间戳统一 |
| SHA1 | 40 字符 hex 字符串 | Platform API | 用于文件身份校验 |
| fileId | 前缀 FL- + 32 字符 | Platform API | 上传成功后返回 |

**说明**: 
- 文件大小限制来自《Freelog 资源发行模块需求分析报告》第 3.2 节
- 压缩格式规范见 ARCHITECTURE/05-压缩打包系统设计.md

---

##### **3.2.4 tools-lib API 调用表**

| 阶段 | 方法名 | 参数 | 返回值 | 说明 |
|------|--------|------|--------|------|
| 压缩目录 | `compressDirectory()` | `dirPath: string`, `ignoreRules: string[]` | `{path: string, sha1: string, size: number}` | 调用框架压缩工具 |
| 判断模式 | `detectUploadMode()` | `size: number` | `'single' \| 'multi'` | >50MB 返回 multi |
| 上传文件 | `uploadFile()` | `fileRef: FileReference`, `mode: 'single' \| 'multi'` | `{fileId: string, url: string}` | 调用 G2-UPLOAD 服务 |
| 保存断点 | `saveCheckpoint()` | `step: string`, `data: UploadState` | `void` | 调用 G3-CHECKPOINT |

---

##### **3.2.5 If-then-else 伪代码**

```
IF 文件大小 > 50MB THEN
    设置 uploadMode = 'multi'  // 分片模式
    计算分片大小 = 5MB
    FOR 每个分片 DO
        saveCheckpoint('upload', {currentChunkIndex})
        uploadChunk(chunkData)
        IF 网络中断 THEN
            resumeFromCheckpoint()
            CONTINUE
        END IF
    END FOR
ELSE
    设置 uploadMode = 'single'  // 单片模式
    uploadFile(fileData)
END IF

IF 压缩失败 THEN
    showErrorMessage("压缩过程中遇到无法读取的文件")
    listProblematicFiles()
    exitCode = 201
ELSIF 上传超时 THEN
    showWarning("网络连接超时，正在重试...")
    retryCount++
    IF retryCount >= 3 THEN
        showErrorMessage("上传失败，请检查网络后重试")
        exitCode = 202
    END IF
END IF
```

---

##### **3.2.6 错误码映射表**

| 错误码 | 触发场景 | 用户可见提示 | 恢复建议 |
|--------|---------|------------|---------|
| **201** | 压缩过程中遇到无法读取的文件 | "压缩失败：检测到 X 个无法访问的文件，请检查权限后重试" | `freelog publish --dir ./new-path` |
| **202** | 上传超时超过 3 次重试 | "上传失败：网络连接不稳定，请检查网络后重试" | 检查网络并重跑命令 |
| **203** | 目标磁盘空间不足 | "压缩失败：磁盘空间不足，当前可用空间 Y GB" | 清理磁盘空间后重试 |
| **204** | G2-UPLOAD 服务返回 4xx 错误 | "上传被拒绝：{error.message}" | 检查账号授权状态 |
| **205** | Checkpoint 文件损坏 | "断点文件损坏，将重新开始上传" | 自动忽略旧 checkpoint 并重建 |

**分类说明**:
- 2xx 错误码属于「工具层失败」，由 CLI 框架或通用模块产生
- 具体错误码定义见 ARCHITECTURE/05-错误码体系.md

---

## 🚫 **禁止事项**

### **1. 禁止出现真实代码**
❌ 错误示范:
```typescript
if (fileSize > 50 * 1024 * 1024) {
  return 'multi';
}
```

✅ 正确写法（伪代码）:
```
IF 文件大小 > 50MB THEN
    返回 'multi'
ELSE
    返回 'single'
END IF
```

---

### **2. 禁止模糊的来源标注**
❌ 错误示范:
> "authId ≤60 字符"

✅ 正确写法:
> "authId ≤60 字符（来源：P0-F0-Phase1 验证，Platform API）"

---

### **3. 禁止职责混淆**
❌ 错误示范:
- 在 PHASE 中写压缩工具的实现逻辑
- 在 ARCHITECTURE 中写 Step1→Step4 的流程编排

✅ 正确划分:
- **ARCHITECTURE**: 「有哪些框架能力」（静态能力清单）
- **PHASE**: 「如何使用这些能力」（动态流程编排）

---

## 📚 **参考文档**

阅读本模板前，请先了解：
1. [DESIGN.md](file://D:\appinside\freelog-runtime-cli\DESIGN.md) - 产品设计的唯一真源
2. [ARCHITECTURE/README.md](file:///d:/appinside/freelog-runtime-cli/docs/一期/产品方案/脚手架设计/ARCHITECTURE/README.md) - 框架能力定义
3. [REUSE/README.md](file:///d:/appinside/freelog-runtime-cli/docs/一期/产品方案/脚手架设计/REUSE/README.md) - 通用模块说明

---

## 🔄 **版本历史**

| 版本 | 更新日期 | 修改内容 | 作者 |
|------|---------|---------|------|
| v1.0 | 2026-09-03 | 初始版本，确立 PHASE 标准模板格式 | AI + Product Team |

---

## 💡 **常见问题**

**Q: 如何判断某个信息应该写在 PHASE 还是 ARCHITECTURE？**  
A: 如果信息描述的是「静态能力」（如压缩工具有哪些参数），写入 ARCHITECTURE；如果是「动态流程」（如 Step2 如何调用压缩工具），写入 PHASE。

**Q: 字段约束太多怎么办？**  
A: 只列出该 Step 涉及的字段约束，其他字段的约束可以引用业务梳理文档。

**Q: ASCII Diagram 画不下所有内容怎么办？**  
A: 保持核心交互流程完整，次要信息可以用文字说明补充。
