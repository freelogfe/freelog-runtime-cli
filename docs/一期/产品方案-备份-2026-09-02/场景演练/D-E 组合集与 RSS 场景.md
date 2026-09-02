# D-E 组：合集创建与维护场景 (D01-D08) + RSS 收录场景 (E01-E06)

> **文档角色**: 覆盖合集管理、RSS 自动化收录的完整用户旅程  
> **关联场景**: A 组环境准备 → D 组合集管理 / E 组 RSS 自动收录  
> 最后更新:2026-09-02

---

## 📋 **第一部分：合集管理场景 (D01-D08)**

### **D01: 从本地目录创建合集**

```bash
$ freelog collection create ./my-series/

┌─ 合集创建向导 ────────────────────────────────┐
│                                                │
│ 扫描目录结构：./my-series/                    │
│   ✓ 发现 3 个资源条目：                        │
│     • episode-01 (第一季第一集)              │
│     • episode-02 (第一季第二集)              │
│     • episode-03 (第一季第三集)              │
│                                                │
│ 请输入合集标题 [回车默认"我的系列剧集"]:      │
| > 星空探索纪录片 series                      │
│                                                │
│ 请输入合集描述:                               │
| > 深入探索宇宙奥秘的科学纪录片系列            │
│                                                │
│ ✅ 检测到的条目信息:                          │
│    1. episode-01 → "第一季第一集：宇宙的起源"  │
│    2. episode-02 → "第一季第二集：黑洞之谜"    │
│    3. episode-03 → "第一季第三集：暗物质"      │
│                                                │
│ ⚠️  提示：                                   │
│   - 条目标题将自动从文件夹名提取               │
│   - 后续可在 Console 或 CLI 中修改             │
│   - RSS 合集禁用条目标题编辑                   │
│                                                │
│ 确认创建合集？[Y/n]: Y                        │
│                                                │
└────────────────────────────────────────────────┘

▶ 创建合集壳...
✅ 集合 ID: COL-VIDEO-1234567
✅ 条目数量：3 个
✅ 创建时间：2026-09-02T14:30:00Z
```

**实现细节**:
```typescript
async function createCollectionFromDirectory(dirPath: string): Promise<CreateResult> {
  // Step 1: 解析目录结构
  const entries = await parseDirectoryStructure(dirPath);
  
  // Step 2: 验证每个条目是否已是资源
  const resources = await Promise.all(
    entries.map(async (entry) => {
      const resource = await platform.findResourceByFolder(entry.path);
      if (!resource) {
        throw new UserFacingError('ENTRY_NOT_RESOURCE', {
          entry: entry.name,
          hint: '请先发布该条目对应的资源'
        });
      }
      return {
        resourceId: resource.id,
        itemTitle: path.basename(entry.path),  // 从文件夹名提取
        sortOrder: entries.indexOf(entry) + 1
      };
    })
  );
  
  // Step 3: 创建合集
  const collection = await platform.Resource.create({
    resourceTypeCode: 'video-collection',
    resourceTitle: collectionTitle,
    name: `${username}/${slugify(collectionTitle)}`,
    description: collectionDescription
  });
  
  // Step 4: 添加条目
  await platform.Resource.updateCollection({
    collectionId: collection.id,
    items: resources
  });
  
  return {
    collectionId: collection.id,
    itemCount: resources.length,
    status: 'created'
  };
}
```

---

### **D02: 合集条目排序与位置调整**

```bash
$ freelog collection update COL-VIDEO-1234567

┌─ 合集条目管理 ────────────────────────────────┐
│                                                │
│ 合集标题：星空探索纪录片 series               │
│ 当前条目数：3                                 │
│                                                │
│ 📋 条目列表:                                  │
│   [1] 宇宙的起源                              │
│   [2] 黑洞之谜                                │
│   [3] 暗物质                                  │
│                                                │
│ 可选操作:                                    │
│   a) 移动条目位置 (上下箭头)                  │
│   b) 删除条目                                │
│   c) 添加新条目                              │
│   d) 保存并退出                              │
│                                                │
│ 请选择操作 [a-d]: a                         │
│                                                │
│ ▶ 选择要移动的条目编号 [1-3]: 2              │
│                                                │
│ [↑] 向上移动  [↓] 向下移动  [ESC] 取消       │
│                                                │
│ 当前排序：                                   │
│   [1] 黑洞之谜 ← (原 #2 已上移)              │
│   [2] 宇宙的起源                            │
│   [3] 暗物质                                │
│                                                │
│ 💾 已更新排序，下次运行将生效                │
│                                                │
└────────────────────────────────────────────────┘
```

**Checkpoint 保存点**:
```json
{
  "collectionId": "COL-VIDEO-1234567",
  "step": "item_reordering",
  "collectedData": {
    "newItemOrder": [2, 1, 3],
    "timestamp": "2026-09-02T14:35:00Z"
  },
  "status": "pending_remote_write"
}
```

---

### **D03: 向合集添加已有资源**

```bash
$ freelog collection add COL-VIDEO-1234567

┌─ 添加条目到合集 ────────────────────────────┐
│                                               │
│ 合集：星空探索纪录片 series                  │
│ 当前条目：3 个                                 │
│                                               │
│ 输入资源 ID 或搜索关键词:                     │
│ > 搜索："宇宙"                             │
│                                               │
│ 🔍 搜索结果:                                 │
│   1. RES-VIDEO-1111111 - 宇宙的形成         │
│   2. RES-VIDEO-2222222 - 早期宇宙           │
│   3. RES-VIDEO-3333333 - 宇宙膨胀           │
│                                               │
│ 请选择要添加的资源编号 [1-3]: 1            │
│                                               │
│ ℹ️  资源信息:                               │
│    标题：宇宙的形成                         │
│    版本：1.0.0                              │
│    Owner: sci-channel                       │
│                                               │
│ 确定添加？[Y/n]: Y                          │
│                                               │
└───────────────────────────────────────────────┘

▶ 添加到合集...
✅ 成功添加条目 "宇宙的形成"
   位置：#1 (最新添加置顶)
   新的条目总数：4 个
```

**重复检测逻辑**:
```typescript
async function checkDuplicateInCollection(collectionId: string, resourceId: string): Promise<DuplicateCheck> {
  const existingItems = await platform.getCollectionItems(collectionId);
  
  const duplicate = existingItems.find(item => item.resourceId === resourceId);
  
  if (duplicate) {
    return {
      isDuplicate: true,
      currentPosition: existingItems.indexOf(duplicate) + 1,
      hint: `该资源已在合集中 (#${existingItems.indexOf(duplicate) + 1})`
    };
  }
  
  return { isDuplicate: false };
}
```

---

### **D04: 从合集移除条目**

```bash
$ freelog collection remove COL-VIDEO-1234567 ITEM-789

┌─ 移除合集条目 ─────────────────────────────┐
│                                               │
│ 合集：星空探索纪录片 series                  │
│ 要移除的条目：ITEM-789 "早期宇宙视频"        │
│                                               │
│ ⚠️  警告：                                   │
│   此操作仅从合集中移除条目，不会删除资源本身    │
│   资源仍保留在 owner 的账户下                  │
│                                               │
│ [Y] 确认移除  [N] 取消                      │
│                                               │
│ Y                                              │
│                                               │
│ ✅ 条目已移除                                │
│    新的条目总数：3 个                          │
│    Checkpoint 已保存                           │
│                                               │
└───────────────────────────────────────────────┘
```

---

### **D05: 更新合集展示信息 (封面/简介/标签)**

```bash
$ freelog collection update-listing COL-VIDEO-1234567

┌─ 更新合集展示信息 ───────────────────────────┐
│                                               │
│ 1) 封面图片                                    │
│    当前：https://cdn.freelog.cn/cover-old.jpg │
│    新封面路径：./assets/collection-cover.png │
│    ✓ 格式验证通过 (PNG, 1280x720, 1.5MB)      │
│                                               │
│ 2) 合集描述                                     │
│    当前：深入探索宇宙奥秘的科学纪录片系列     │
│    新描述：                                    │
│    > 全新修订版：包含 5 季共 50 集内容        │
│                                               │
│ 3) 标签                                        │
│    当前：["纪录片", "科学"]                   │
│    新标签：纪录片，科学，宇宙，教育           │
│    ✓ 去重后：4 个标签                         │
│                                               │
│ ┌─ 提交确认 ─────────────────────────────┐   │
│ │ 即将更新以下信息：                      │   │
│ │ • 封面图片 → collection-cover.png      │   │
│ │ • 描述 → 全新修订版...                 │   │
│ │ • 标签 → 新增"宇宙""教育"              │   │
│ │                                          │   │
│ │ ⚠️  这些改动将立即生效并可被公开搜索    │   │
│ └──────────────────────────────────────────┘   │
│                                               │
│ [Y/n]: Y                                       │
│                                               │
└───────────────────────────────────────────────┘

▶ 正在提交更新...
├─ ✅ 封面上传完成
├─ ✅ 描述更新完成
└─ ✅ 标签更新完成

🎉 合集展示信息更新成功!
```

**封面处理**:复用封面图片上传逻辑 (详见《封面图片上传验证实现规格》)

---

### **D06: 设置合集的 collect-rules 自动收录规则**

```bash
$ freelog collection set-collect-rules COL-VIDEO-1234567

┌─ 自动收录规则配置 ──────────────────────────┐
│                                               │
│ 启用自动收录功能？[Y/n]: Y                    │
│                                               │
│ 规则关系：                                    │
│   AND - 所有条件必须满足才收录                │
│   OR  - 任一条件满足即可收录                  │
│                                               │
│ 请选择 [A/O] [回车默认 AND]:                  │
│                                                 │
│ 添加收录条件:                                 │
│   1) feed_url 等于 https://example.com/feed   │
│   2) publish_time >= 2026-09-01               │
│   3) resource_title contains "宇宙"           │
│                                               │
│ 输入条件编号添加 (或直接回车完成):            │
│                                                 │
│ ⚙️  规则摘要预览:                             │
│   IF (feed_url == "https://example.com/feed") │
│   AND (publish_time >= "2026-09-01")          │
│   AND (resource_title CONTAINS "宇宙")        │
│   THEN auto-collect                           │
│                                               │
│ 确认设置规则？[Y/n]: Y                        │
│                                               │
└───────────────────────────────────────────────┘

▶ 验证规则 JSON Schema...
✅ 规则格式正确
✅ 字段枚举值合法 (feed_url/publish_time/resource_title)
✅ 操作符合法 (= >= contains)

💾 collect-rules 已保存到平台
   规则 ID: RULE-COLLECT-8847953
   下次同步时将应用此规则
```

**collect-rules 数据结构**:
```typescript
interface CollectRules {
  enabled: boolean;
  logic: 'AND' | 'OR';
  conditions: Array<{
    field: 'feed_url' | 'publish_time' | 'resource_title' | 'auth_identity' | 'resource_type_code';
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts_with' | 'ends_with';
    value: string;
  }>;
}
```

---

### **D07: RSS 绑定到合集**

```bash
$ freelog collection bind-rss COL-VIDEO-1234567

┌─ RSS 绑定到合集 ─────────────────────────────┐
│                                               │
│ 合集：星空探索纪录片 series                  │
│                                               │
│ 步骤 1: 输入 Feed URL                         │
│ 请输入 RSS 地址：                             │
│ > https://science-podcast.example.com/feed.xml│
│                                               │
│ 步骤 2: 检测 Feed 合法性                      │
│ ✅ Feed 预览成功                              │
│    标题：Science Weekly Podcast               │
│    条目数：15 (最近 15 条)                    │
│    语言：en-US                                │
│                                               │
│ 步骤 3: GUID 冲突检测                         │
│ ⚠️  发现 1 个 GUID 冲突:                       │
│    - guid: "urn:uuid:abc123"                 │
│    - 对应资源："黑洞探索 EP1"(RES-VIDEO-xxx)  │
│                                               │
│ 处理方式：                                    │
│   [1] 强制绑定 (允许重复 GUID)                │
│   [2] 跳过冲突条目                            │
│   [3] 取消绑定                                │
│   请选择 [1-3] [回车默认 2]: 2               │
│                                               │
│ 步骤 4: 验证码 (如需要)                       │
│ 🔒 平台要求验证码                            │
│   图片链接：https://captcha.freelog.cn/img?session=xyz│
│   请输入验证码：__________                    │
│   [✓] 验证通过                               │
│                                               │
│ 步骤 5: 初始化 collect-rules                  │
│ ✅ 自动收录规则已生成:                        │
│   - feed_url = "https://science-podcast.example.com/feed.xml"│
│   - publish_time >= now                       │
│   关系：AND                                   │
│                                               │
│ 确认绑定 RSS？[Y/n]: Y                        │
│                                               │
└───────────────────────────────────────────────┘

▶ 调用绑定义 API...
✅ RSS 绑定成功
   Feed ID: FEED-RSS-9928374
   Collection ID: COL-VIDEO-1234567
   
🔄 首次同步任务已触发
   Task ID: SYNC-TASK-12345
   预计耗时：5-10 分钟
   
📊 同步进度可查询：freelog sync status SYNC-TASK-12345
```

**Checkpoint 保存点**:
- 保存 Feed URL 和 session ID
- 验证码失败则不保存
- 成功后删除 checkpoint

---

### **D08: 查看合集统计信息**

```bash
$ freelog collection stats COL-VIDEO-1234567

┌─ 合集统计报告 ───────────────────────────────┐
│                                               │
│ 基本信息:                                     │
│   合集 ID: COL-VIDEO-1234567                  │
│   标题：星空探索纪录片 series                 │
│   Owner: sci-channel                         │
│   创建时间：2026-09-02 14:30:00 UTC          │
│   最后更新：2026-09-02 15:45:00 UTC          │
│                                               │
│ 内容统计:                                     │
│   总条目数：3                                 │
│   已收录资源：3 个                              │
│   RSS 来源：1 个 (science-podcast.example.com)│
│   自动收录：启用 (RULE-COLLECT-8847953)      │
│                                               │
│ 访问量统计 (近 30 天):                        │
│   总播放量：12,345 次                        │
│   新增粉丝：234 人                           │
│   平均观看时长：18 分钟                      │
│                                               │
│ 最新同步状态:                                 │
│   最后同步时间：2026-09-02 15:00:00 UTC      │
│   本次同步：新增 0 条目，更新 1 条目，删除 0 条目│
│   同步状态：✅ 正常                           │
│                                               │
└───────────────────────────────────────────────┘
```

---

## 📋 **第二部分：RSS 自动收录场景 (E01-E06)**

### **E01: 单个 RSS 源首次绑定**

(已在《RSS 自动化收录实现规格》中详细定义，此处为精简版示例)

```bash
$ freelog rss bind https://blog.example.com/feed.xml

┌─ RSS 绑定流程 ──────────────────────────────┐
│                                               │
│ ✓ Feed URL 格式验证通过                      │
│ ✓ Feed 合法性检测通过 (标题：技术博客)        │
│ ✓ 数量限制检查通过 (当前 3/10)               │
│ ✓ GUID 去重检查通过 (无冲突)                 │
│ ✓ 验证码处理 (跳过，未触发风控)              │
│ ✓ 集合创建/复用 (新建"技术博客合集")         │
│ ✓ collect-rules 初始化 (默认 AND 逻辑)        │
│ ✓ 首次同步触发 (异步任务)                    │
│                                               │
│ ✅ RSS 绑定成功                               │
│    Collection ID: COL-BLOG-12345             │
│    Feed ID: FEED-BLOG-67890                  │
│    Sync Task ID: TASK-SYNC-111               │
│                                               │
│ 💡 建议：                                     │
│   - 在 Console 中查看实时同步进度             │
│   - 使用 `freelog sync status TASK-SYNC-111`│
│     查询 CLI 同步状态                         │
│                                               │
└───────────────────────────────────────────────┘
```

---

### **E02: RSS 同步状态查询**

```bash
$ freelog sync status TASK-SYNC-111

┌─ 同步任务状态 ─────────────────────────────┐
│                                               │
│ 任务 ID: TASK-SYNC-111                        │
│ 集合：技术博客合集 (COL-BLOG-12345)           │
│ Feed: https://blog.example.com/feed.xml      │
│ 启动时间：2026-09-02 15:00:00 UTC            │
│                                               │
│ 当前状态：⏳ 进行中 (35%)                     │
│                                               │
│ 处理进度:                                     │
│   已处理条目：5/15                           │
│   新增资源：3 个                               │
│   更新资源：1 个                               │
│   跳过重复：1 个                               │
│   失败重试：0 个                               │
│                                               │
│ 实时日志:                                     │
│   [15:01:23] 处理条目 #1 - 成功              │
│   [15:01:25] 处理条目 #2 - 成功              │
│   [15:01:28] 处理条目 #3 - 成功 (新资源)     │
│   [15:01:30] 处理条目 #4 - 成功              │
│   [15:01:33] 处理条目 #5 - 跳过 (GUID 重复)   │
│   ...                                         │
│                                               │
│ 预计剩余时间：4 分钟                          │
│                                               │
│ [Ctrl+C] 退出监控模式                         │
│                                               │
└───────────────────────────────────────────────┘
```

---

### **E03: RSS 同步失败恢复**

```bash
$ freelog sync resume TASK-SYNC-111-failed

┌─ 同步恢复 ─────────────────────────────────┐
│                                               │
│ 检测到中断的任务：TASK-SYNC-111               │
│ 最终状态：❌ 失败 (处理到条目 #8)              │
│ 失败原因：网络连接超时                       │
│                                               │
│ 恢复选项:                                     │
│   [1] 从断点处继续 (从 #9 开始)               │
│   [2] 重新开始 (从头开始)                    │
│   [3] 手动指定起始条目                       │
│   [4] 取消恢复                               │
│                                               │
│ 请选择 [1-4] [回车默认 1]: 1                │
│                                               │
│ ▶ 恢复执行中... [███████░░░] 67%           │
│   条目 #9-15 已成功处理                       │
│   新增资源：2 个                               │
│   更新资源：0 个                               │
│   跳过重复：2 个                               │
│                                               │
│ ✅ 同步任务完成                               │
│    总计：新增 5 个，更新 1 个，跳过 3 个        │
│                                               │
└───────────────────────────────────────────────┘
```

**Checkpoint 恢复逻辑**:
```typescript
async function resumeSyncTask(taskId: string): Promise<ResumeDecision> {
  const checkpoint = await loadCheckpoint(`sync-${taskId}.json`);
  
  if (!checkpoint) {
    throw new UserFacingError('CHECKPOINT_MISSING', {
      taskId,
      hint: '无法找到恢复点，请重新开始'
    });
  }
  
  // 校验 accountId
  if (checkpoint.accountId !== currentAccountId) {
    throw new UserFacingError('ACCOUNT_MISMATCH', {
      hint: 'Checkpoint 所属账号与当前不一致'
    });
  }
  
  // 判断可跳过的步骤
  const skippedSteps = ['feed_validation', 'guid_check'];  // 已完成
  
  return {
    allowed: true,
    skipSteps: skippedSteps,
    requiredSteps: ['sync_remaining_items'],
    lastProcessedIndex: checkpoint.lastProcessedIndex
  };
}
```

---

### **E04: RSS 数量超限处理**

```bash
$ freelog rss bind https://new-blog.com/feed.xml

┌─ RSS 绑定 ──────────────────────────────────┐
│                                               │
│ 当前账号 RSS 数量：10/10 (已达上限)           │
│                                               │
│ ❌ 无法绑定新的 RSS 源                        │
│                                               │
│ 可用选项:                                     │
│   1) 删除旧 RSS (管理界面)                   │
│      $ freelog rss list                      │
│      $ freelog rss delete FEED-XXX           │
│                                               │
│   2) 联系管理员升级计划                      │
│      请访问：https://freelog.cn/pricing       │
│                                               │
│   3) 取消本次绑定                            │
│                                               │
│ 请选择操作 [1-3] [回车默认 3]: 1             │
│                                               │
│ ▶ 跳转到 RSS 管理界面...                      │
│   (详见 D 组合集管理场景)                    │
│                                               │
└───────────────────────────────────────────────┘
```

---

### **E05: GUID 冲突处理策略**

```bash
$ freelog rss bind https://conflicting-feed.com/feed.xml

┌─ RSS 绑定 ─────────────────────────────────┐
│                                               │
│ ⚠️  GUID 冲突检测完成                         │
│                                               │
│ 冲突详情:                                     │
│   Feed 中的 GUID: "urn:uuid:abc123"           │
│   已存在资源：                                │
│     • RES-VIDEO-1111111 "黑洞探索 EP1"        │
│     • RES-VIDEO-2222222 "黑洞探索 EP2"        │
│                                               │
│ 影响范围：2 个条目                            │
│                                               │
│ 处理策略:                                     │
│   [1] 强制绑定 (忽略 GUID 重复，创建新资源)    │
│   [2] 跳过冲突条目 (只收录 GUID 唯一的部分)    │
│   [3] 完全取消绑定                            │
│                                               │
│ 建议选择 [2] 避免数据冗余                     │
│                                               │
│ 请输入选项编号 [1-3] [回车默认 2]: 2         │
│                                               │
│ ▶ 继续绑定 (跳过 2 个冲突条目)                │
│   成功收录：8 个新条目                        │
│   跳过冲突：2 个                              │
│                                               │
│ ✅ 绑定部分成功                              │
│    Collection: COL-BLOG-ALREADY-EXISTS       │
│    Feed: FEED-BLOG-NEW-UPDATE                │
│                                               │
└───────────────────────────────────────────────┘
```

---

### **E06: 定期检查 RSS 同步健康度**

```bash
$ freelog rss health-check

┌─ RSS 同步健康度报告 ────────────────────────┐
│                                               │
│ 扫描周期：近 7 天                               │
│ 管理的 RSS 源：10 个                            │
│                                               │
│ 🟢 正常：7 个                                  │
│   ✓ FEED-BLOG-001 (同步正常，延迟<5min)      │
│   ✓ FEED-BLOG-002 (同步正常，延迟<1min)      │
│   ✓ FEED-BLOG-003 (同步正常，延迟<10min)     │
│   ✓ FEED-PODCAST-001 (同步正常)              │
│   ✓ FEED-NEWS-001 (同步正常)                 │
│   ✓ FEED-AUDIO-001 (同步正常)                │
│   ✓ FEED-VLOG-001 (同步正常)                 │
│                                               │
│ 🟡 需关注：2 个                                │
│   ⚠️ FEED-BLOG-004 (同步延迟>1h)              │
│      建议：检查 feed 源稳定性                  │
│   ⚠️ FEED-AUDIO-002 (部分 GUID 冲突)           │
│      建议：review 冲突条目                    │
│                                               │
│ 🔴 异常：1 个                                  │
│   ✗ FEED-NEWS-002 (同步连续失败 3 次)         │
│      错误：Feed 源不可达 (HTTP 503)            │
│      建议：检查 feed URL 是否有效              │
│                                               │
│ 💡 总体健康度：85% (良好)                      │
│                                               │
│ [Q] 退出  [R] 刷新  [D] 查看详情               │
│                                               │
└───────────────────────────────────────────────┘
```

---

## ✅ **第三部分：验收标准总结**

### **功能覆盖率**

| 场景组 | 场景数 | 覆盖内容 | 实现状态 |
|-------|--------|---------|---------|
| D01-D08 | 8 个 | 合集全生命周期管理 | ✅ 已详细设计 |
| E01-E06 | 6 个 | RSS 绑定/同步/恢复 | ✅ 已详细设计 |
| **关键集成点** | | | |
| - collect-rules 配置 | 1 个 | 自动收录规则 | ✅ 在 D06 中定义 |
| - 验证码处理 | 1 个 | RSS 风控绕过 | ✅ 在 E01 中定义 |
| - GUID 冲突策略 | 3 种 | 强制/跳过/取消 | ✅ 在 D02/E05 中定义 |
| - 断点续传机制 | 2 个 | 同步中断恢复 | ✅ 在 E03 中定义 |

---

## 🔧 **仍需补充的实现规格**

1. ❌ **合集条目维护详细规范** (D01-D05 的详细代码实现)
2. ❌ **collect-rules 构造器 UI 规范** (D06 的条件编辑器)
3. ❌ **RSS 同步状态机完整定义** (E02-E04 的状态流转)

这些将在后续迭代中补充。
