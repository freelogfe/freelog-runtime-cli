# Freelog Runtime CLI 场景演练手册

> **目的**: 通过编写详尽的实际使用场景，反推产品设计（产品方案）的完整性、合理性和细节覆盖程度
> 
> **原则**: 每个场景都必须基于 Console 源码证据（需求分析报告）和现有产品方案（02-字段接口），同时考虑 CLI 环境差异
> 
> **产出物**: 最终汇总为 `Z-设计修订总结.md`，指导具体修改哪些文档的哪些部分

---

## 📋 目录结构

### A-环境与身份场景 (8 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| A01 | 正常首次登录并发布 | 环境检测、账号确认、owner 展示 |
| A02 | 多账号环境下选择 owner | 多 profile 识别、owner 不一致告警 |
| A03 | CI 模式无凭据错误 | AUTH_REQUIRED 结构化输出 |
| A04 | 临时会话模式启动 | session 文件读取、不污染 default |
| A05 | owner 不一致时的处理 | 加载远端后对比 userId、阻止写入 |
| A06 | 已登录但 token 过期 | refresh token 失败提示重新登录 |
| A07 | 切换账号后的状态清理 | accountId change、checkpoint 失效 |
| A08 | 未指定环境时的门禁 | production/prod 阻断、需显式 --env |

### B-本地准备场景 (8 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| B01 | 独立模板创建新工程 | create theme/plugin、只写本地 |
| B02 | 现有工程自动识别 manifest | 读取 freelog.manifest.json、推断默认值 |
| B03 | 目录压缩生成 artifact | pack dir、输出 sha1、不上传 |
| B04 | 构建后产物确认 | build output、zip/tar.gz 选择 |
| B05 | 已有压缩包复用发布 | .freelog-artifacts/扫描、校验 sha1 |
| B06 | 单文件直接发布 | 非目录类型、跳过压缩步骤 |
| B07 | 忽略规则应用 (.gitignore) | 排除隐藏文件、VCS、缓存 |
| B08 | 压缩失败处理 (空目录/不可读) | 停止在压缩阶段、保留错误信息 |

### C-单资源首次发布场景 (15 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| C01 | 普通文件型资源完整发布 | 单文件→资源壳→版本→策略→listing |
| C02 | 目录型资源先构建再发布 | 识别 template→build→compress→upload |
| C03 | 主题资源发行 +Console 接力 | 类型树筛选 theme→节点激活链接输出 |
| C04 | 插件资源依赖检查 | 主题依赖插件是否存在、是否需要签约 |
| C05 | 标题超长截断 (100 字符) | 前端拦截、显示当前长度和上限 |
| C06 | 授权标识规范化 + 查重 | 非法字符替换→后端再次确认 |
| C07 | 首版版本号固定 1.0.0 | 不可改、提示用户这是首版 |
| C08 | 新版本必须大于 latestVersion | semver.gt 校验、列出建议版本号 |
| C09 | 依赖版本范围不命中 | validRange+命中校验、提前拦截 |
| C10 | 封面格式大小双重校验 | JPEG/PNG/GIF≤5MB、本地预检 |
| C11 | 标签去重+超限 (20 个/20 字符) | CLI 前端过滤并提示冲突 |
| C12 | 简介超长 (200 字符) | 计数提示、建议摘要但不自动覆盖 |
| C13 | 策略模板为空时的降级 | "平台无可用模板"提示、允许稍后处理 |
| C14 | 编译失败回到参数编辑 | policyReCompile 报错→定位到具体参数 |
| C15 | 翻译失败时不保存 | policyTranslation 错误→中止写入 |

### D-已有资源维护场景 (12 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| D01 | 更新已有资源的新版本 | 继承 latestVersion→上传新文件→createVersion |
| D02 | 维护版本信息不替换文件 | updateResourceVersionInfo 仅 description/inputAttrs |
| D03 | listing 修改只显示 diff | intro/tags/cover 对比后提交改动字段 |
| D04 | 策略上下线操作 | updatePolicies[{policyId,status}]、二次确认 |
| D05 | 上架前的前置条件检查 | 必须有版本 + 上线策略、否则弹窗引导 |
| D06 | 下架时的二次确认 | status=4、明确线上影响提示 |
| D07 | 冻结状态的读取与拒绝 | status=2、显示冻结原因、给 Console 链接 |
| D08 | owner 不一致时阻止所有写入 | 加载远端后立即对比 userId/userName |
| D09 | 批量下架多个资源 | batchUpdate({resourceIds:[],status:4}) |
| D10 | 已有资源的策略模板复用 | 拉取同类型模板、不重复提交代码 |
| D11 | 恢复被下架的资源 | status=1、验证版本和策略是否仍有效 |
| D12 | 版本描述 HTML vs 纯文本 | TTY 纯文本输入/AI 包装成<p>标签 |

### E-合集与 RSS 场景 (15 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| E01 | 合集创建流程完整走通 | subjectType=4→条目添加→策略→listing |
| E02 | 批量添加至合集 (≤100 个) | resourceIds[]分批上传、每项结果报告 |
| E03 | 条目标题草稿维护 | itemTitle!=资源全局 title、区分明显 |
| E04 | 合集条目排序调整 | reorderCollectionItems_Draft 接口调用 |
| E05 | RSS 绑定成功路径 | feed 预览→验证码→绑定成功 |
| E06 | RSS matchedItemCount >1000 | 强制日期范围筛选、结束时间为今日 |
| E07 | RSS 验证码错误处理 | 只清验证码、保留 feed 和 preview |
| E08 | RSS GUID 大面积不匹配 | 计算差异量、明确确认弹窗 |
| E09 | RSS 绑定后锁定字段 | title/cover/intro禁用、tags 仍可编辑 |
| E10 | collect-rules启用/停用 | serializeStatus/status字段分离 |
| E11 | collect-rules条件关系 | every/some二选一、自然语言摘要 |
| E12 | collect-rules字段联动 | key 限三个选项、value 与前缀一致 |
| E13 | 合集上架前策略检查 | 无上线策略时阻止上架并给链接 |
| E14 | 删除合集条目草稿 | deleteCollectionItems_Draft 接口 |
| E15 | 合集列表刷新机制 | 轮询获取最新 items、避免 stale data |

### F-批量与自动收录场景 (11 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| F01 | 批量创建同类型资源 | supportCreateBatch=2 类型过滤 |
| F02 | 文件名冲突检测 (createBatch) | getResourceBySha1 查重、给出建议 |
| F03 | 分批写入的策略 | batchSize 默认值、恢复粒度不是业务限制 |
| F04 | remote_outcome_unknown 状态 | 未知结果时先查远端再决定重试 |
| F05 | 批量报告中每项独立状态 | created/version_created/failed/skipped |
| F06 | 修复失败项后 resume | report 恢复、逐项 retry |
| F07 | 批量中混入冻结资源 | 自动跳过、报告中 marked as skipped |
| F08 | 批量命名规则模板 | {原文件名}_{序号}、去扩展名 |
| F09 | 批量标签一键应用 | 并集逻辑、≤20 个限制 |
| F10 | 批量策略一键应用 | 所有资源用同一政策、或自定义分组 |
| F11 | 批量发布取消时的状态 | 已成功项不回滚、待处理项标记 cancelled |

### G-主题插件与 AI 场景 (10 个)
| 编号 | 场景名称 | 验证点 |
|------|---------|--------|
| G01 | 主题资源从模板创建 | create theme → React/Vue 模板 → 本地工程 |
| G02 | 主题资源发行 + 节点激活接力 | resourceId/policyIds/link 输出 |
| G03 | 插件资源依赖检查 | FThemeDependencyPlugins 组件对齐 |
| G04 | 支付/签约 HANDOFF 路径 | Console 链接携带 resourceId/versionId |
| G05 | AI 模式的 JSON 稳定输出 | plan/dry-run/report 结构一致性 |
| G06 | CI 脚本化发布的 errorcode | 缺字段→missing_fields 结构化错误 |
| G07 | NDJSON 逐行事件流 | item_started/item_succeeded/item_failed |
| G08 | 非交互模式 checkpoint 行为 | 不保存 checkpoint、完全依赖 manifest |
| G09 | Plan/Dry-run 零副作用 | 不上传、不写远端、不保存 state |
| G10 | Session 模式 EphemeralStore | 不写 manifest/state、可 exportProject |

---

## 📖 使用方式

### 1. 阅读顺序
```text
先看方法论和本章引言 → 理解场景分类逻辑
→ 逐个场景模拟真实用户操作流程
→ 发现设计缺口和问题
→ 最后汇总到 Z-设计修订总结.md
```

### 2. 场景模板结构
每个场景包含：
- **基本信息**: 用户画像、目标、场景描述
- **完整交互流程**: Step 1-N 的详细对话
- **设计验证点**: ✅已覆盖 ❌遗漏 ⚠️需要明确的问题
- **涉及文档章节**: 02/04/05/06 的具体位置

### 3. 问题标记规范
| 优先级 | 含义 | 处理方式 |
|--------|------|---------|
| P0 | 必须立即修复 | 阻塞性设计缺陷 |
| P1 | 应在下一轮迭代完成 | 重要体验优化 |
| P2 | 优化类 | 锦上添花的功能 |

---

## 🎯 预期产出

写完所有场景后，生成：
1. **设计问题总表**: 按优先级汇总所有发现的缺口
2. **文档修订清单**: 明确指出修改 02/04/05/06 的哪些章节
3. **新增内容建议**: 是否需要补充新的章节（如 Checkpoint 数据结构细化）
4. **测试用例映射**: 如何将场景转化为自动化测试

---

**现在开始逐个编写场景...**
