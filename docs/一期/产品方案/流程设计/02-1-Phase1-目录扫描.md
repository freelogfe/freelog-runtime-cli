# F2.1 · Phase1 - 目录扫描详细流程

> **文档角色**: 覆盖 Phase1"目录扫描"的全部细节  
> **对齐 Source**: CLI 的 DirectoryScanner 实现  
> 最后更新：2026-09-02

---

## 📋 **一、Phase1 流程总览**

```bash
$ freelog batch-publish ./my-themes/

┌─ Freelog 批量发布 ───────────────────────────────┐
│                                                    │
│ Phase 1: 目录扫描                                   │
│                                                    │
│ ▼ 扫描配置                                          │
│   • 入口目录：./my-themes/                         │
│   • 匹配规则：manifest.json, freelog.json          │
│   • 跳过隐藏文件：.git/, .DS_Store                  │
│   • 跳过文件夹：node_modules/                       │
│                                                    │
│ ▓▓▓▓▓▓▓▓▓░░ 80%                                    │
│ 当前：./theme-nature/freelog.json                   │
│                                                    │
│ ✅ 扫描完成                     18 个条目           │
│    有效条目：18 | 无效条目：0                        │
│                                                    │
│ ▶ [详情] 查看发现列表                                 │
│    ✓ Theme-Aurora (manifest.json)                   │
│    ✓ Theme-Nature (freelog.json)                    │
│    ...                                             │
│                                                    │
│ 下一步：ENTER | 取消：ESC                           │
└────────────────────────────────────────────────────┘
```

---

## 🔍 **二、详细步骤实现**

### **2.1 扫描规则定义**

```typescript
interface ScanRules {
  // 入口目录
  rootDir: string;
  
  // 匹配规则
  manifestPatterns: string[];  // ['manifest.json', 'freelog.json']
  ignorePatterns: string[];    // ['.git/*', '.DS_Store', 'node_modules/**']
  
  // 过滤选项
  skipHiddenFiles: true;
  skipEmptyDirectories: true;
  maxDepth?: number;           // 默认无限深度
}
```

### **2.2 DirectoryScanner 核心逻辑**

```typescript
// DirectoryScanner 核心逻辑
class DirectoryScanner {
  async scan(config: ScanConfig): Promise<ScanResult> {
    const entries: ValidEntry[] = [];
    const invalidEntries: InvalidEntry[] = [];
    
    // 1. 递归扫描所有文件
    const allFiles = await this.readdirRecursive(config.rootDir);
    
    // 2. 应用忽略规则
    const relevantFiles = allFiles.filter(file => 
      !this.matchesIgnorePattern(file, config.ignorePatterns)
    );
    
    // 3. 查找 manifest 文件
    for (const filePath of relevantFiles) {
      if (this.isManifestFile(filePath)) {
        try {
          const entry = await this.parseManifest(filePath);
          entries.push(entry);
        } catch (err) {
          invalidEntries.push({
            path: filePath,
            reason: this.extractErrorCode(err),
            errorMessage: err.message
          });
        }
      }
    }
    
    return {
      validEntries: entries,
      invalidEntries,
      statistics: this.computeStatistics(entries, invalidEntries)
    };
  }
}
```

### **2.3 TTY 进度渲染器**

```typescript
// TTY 进度显示组件
class ScanProgressRenderer {
  render(scanned: number, total: number, currentFile: string) {
    const percent = Math.round((scanned / total) * 100);
    
    ui.clearLine();
    console.log(`\r▓`.repeat(Math.floor(percent / 10)) + 
               '░'.repeat(10 - Math.floor(percent / 10)) + 
               ` ${percent}% (${scanned}/${total})`);
    
    if (currentFile) {
      console.log(ui.dim(`当前：${path.basename(currentFile)}`));
    }
  }
  
  showSummary(result: ScanResult) {
    console.log('\n\n┌─ 扫描结果 ─────────────────────┐');
    console.log(`│ 有效条目：${result.validEntries.length}                    │`);
    console.log(`│ 无效条目：${result.invalidEntries.length}                   │`);
    console.log('└─────────────────────────────────┘\n');
    
    if (result.invalidEntries.length > 0) {
      console.log('⚠️  无效条目列表:');
      result.invalidEntries.slice(0, 5).forEach(entry => {
        console.log(`  ✗ ${entry.path}`);
        console.log(`    原因：${this.formatReason(entry.reason)}`);
      });
    }
  }
}
```

### **2.4 Manifest 解析逻辑**

```typescript
async function parseManifest(filePath: string): Promise<ValidEntry> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  
  let manifest: ManifestData;
  
  switch (ext) {
    case '.json':
      manifest = JSON.parse(content);
      break;
      
    case '.yaml':
    case '.yml':
      manifest = jsyaml.load(content) as ManifestData;
      break;
      
    default:
      throw new ValidationError('UNSUPPORTED_FORMAT', '不支持的 manifest 格式');
  }
  
  // 验证必填字段
  const validated = ManifestSchema.parse(manifest);
  
  return {
    path: filePath,
    directory: path.dirname(filePath),
    manifestType: detectManifestType(validated),
    resources: validated.resources || [{ type: 'theme' }],
    metadata: {
      title: validated.title,
      version: validated.version,
      author: validated.author
    },
    isValid: true
  };
}

// 自动识别 manifest 类型
function detectManifestType(data: any): ManifestType {
  if (data.type === 'collection') return 'collection';
  if (Array.isArray(data.resources)) return 'batch';
  return 'single';
}
```

---

## 🚨 **三、异常分支处理**

| 异常场景 | 错误码 | 用户提示 | 处理方式 |
|---------|--------|---------|---------|
| 文件不是有效 JSON | MANIFEST_PARSE_ERROR | "manifest.json 格式错误" | 加入 invalidEntries 跳过 |
| 缺少必填字段 | FIELD_REQUIRED | "缺少字段：title" | 加入 invalidEntries 跳过 |
| 检测到循环引用 | CIRCULAR_REFERENCE | "目录结构包含循环" | 终止整个扫描 |
| 磁盘 I/O 错误 | DISK_IO_ERROR | "读取文件失败" | 尝试 3 次后标记为 invalid |
| 权限不足 | PERMISSION_DENIED | "无法访问：{path}" | 记录警告但继续扫描 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|-------|---------|---------|
| 递归扫描 | 正确遍历所有子目录 | Mock 多层级目录 |
| Manifest 识别 | 仅匹配指定文件名 | 测试多种配置文件名 |
| Manifest 解析 | 支持 JSON/YAML 格式 | 不同格式文件测试 |
| 忽略规则 | 正确排除隐藏文件 | .git/node_modules 测试 |
| 进度展示 | 实时百分比 + 当前文件 | 观察 UI 更新 |
| 无效条目处理 | 记录原因但不中断 | 故意放入错误文件 |

---

## 🔗 **五、相关文档索引**

| 文档 | 说明 | 路径 |
|-----|------|------|
| [F2 总纲](../../流程设计/02-批量创建资源总纲.md) | 完整的 F2 流程导航 | 流程设计 |
| [Phase2](./02-2-Phase2-批次划分与配置.md) | 下一步骤 | 流程设计 |

---

**下一步**: 阅读 **[02-2-Phase2-批次划分与配置](./02-2-Phase2-批次划分与配置.md)**
