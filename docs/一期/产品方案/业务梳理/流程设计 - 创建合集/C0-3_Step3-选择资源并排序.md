# C0-3 · Step3 - 选择资源并排序

> **文档角色**:覆盖 Console CollectionCreator Step3"选择资源并排序"的源码对齐  
> **对齐 Source**:Console `packages/console/src/pages/collection/creator/Step3/index.tsx`  
> 最后更新:2026-09-02

---

## 📋 **一、流程总览**

```
┌─ Freelog 合集创建 ────────────────┐
│                                     │
│ ▼ 从已扫描条目中选择                 │
│   ○ Episode-001-AI-Coding         │
│   ● Episode-002-Memory-System     │
│   ● Episode-003-TTY-UI            │
│                                     │
│ [全选]A | [反选]R | [确认]ENTER    │
│                                     │
│ 当前选中 2 个条目                      │
│                                     │
│ ▶ 调整顺序                           │
│   ← ↑ ↓ →键调整位置                  │
│                                     │
│ 最终排序:                            │
│   1. Memory-System                 │
│   2. TTY-UI                        │
│                                     │
│ 下一步:ENTER | 重新选择:R           │
└─────────────────────────────────────┘
```

**业务规则**:
1. **GUID 去重**:自动检测重复 GUID 并提示
2. **多选操作**:支持全选/反选/单选
3. **键盘排序**:使用←↑↓→键调整顺序
4. **最终确认**:确认排序后进入下一步

---

## 🔍 **二、Console 源码证据**

### **2.1 多选择器与排序器组件**

```typescript
// packages/console/src/pages/collection/creator/Step3/index.tsx
class ResourceSelector {
  render(episodes: EpisodeEntry[], selectedGuids: Set<string>) {
    return (
      <div>
        {/* 多选择器 */}
        {episodes.map(episode => (
          <Checkbox
            key={episode.guid}
            checked={selectedGuids.has(episode.guid)}
            onChange={() => toggleSelection(episode.guid)}
          >
            {episode.title}
          </Checkbox>
        ))}
        
        <Button onClick={selectAll}>全选</Button>
        <Button onClick={invertSelection}>反选</Button>
        <Button onClick={confirmSelection} disabled={selectedGuids.size === 0}>
          确认 ({selectedGuids.size})
        </Button>
      </div>
    );
  }
}

class EpisodeSorter {
  render(sortedEpisodes: EpisodeEntry[]) {
    return (
      <SortableList
        items={sortedEpisodes}
        onReorder={(newOrder) => setSortedEpisodes(newOrder)}
        keyboardControls={{ up: 'ArrowUp', down: 'ArrowDown' }}
      >
        {(episode, index) => (
          <div className="sort-item">
            <span className="index">{index + 1}.</span>
            <span className="title">{episode.title}</span>
          </div>
        )}
      </SortableList>
    );
  }
}
```

**CLI 说明**:暂不支持详细的键盘排序 UI，仅实现基础的选择和确认功能。

---

## 🚨 **三、异常分支**

| 错误码 | 触发条件 | 用户提示 | 修复建议 |
|--------|---------|---------|----------|
| DUPLICATE_GUID | GUID 重复 | "发现重复 GUID:{guid}" | 修改重复条目 |
| NO_SELECTION | 未选择任何条目 | "请选择至少一个条目" | 选择条目后提交 |
| SORT_ERROR | 排序失败 | "排序出错" | 重置排序后重试 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|--------|---------|----------|
| 多选操作 | 全选/反选功能正常 | UI 交互测试 |
| GUID 去重 | 正确识别重复 GUID | 构造重复数据验证 |
| 排序功能 | 能调整条目顺序 | 键盘操作测试 |

---

**下一步**:阅读 **[C0-4_Step4_RSS 自动化收录设置](./C0-4_Step4_RSS 自动化收录设置.md)**
