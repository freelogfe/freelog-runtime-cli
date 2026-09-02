# F 组：AI-CI 非交互模式场景（6 个深度场景）

**目标**: 验证 AI/CI 环境下的无交互自动化发布流程

---

## F01 - CI 环境变量驱动的全自动发布

```bash
# .github/workflows/release.yml
name: Release to Freelog

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build theme
        run: npm run build
      - name: Publish to Freelog
        run: |
          export FREELG_TOKEN="${{ secrets.FREELG_TOKEN }}"
          export FREELG_ENV="production"
          freelog publish --yes --no-auto-pull ./dist/theme.zip
```

**CLI 执行日志**:
```bash
$ CI=true freelog publish --yes --no-auto-pull ./dist/theme.zip

🔒 非交互模式检测
  CI=true, TTY=false
  
✅ 检测到 FREELG_TOKEN 环境变量
  
🔍 验证凭据
  账号：ci-deploy-bot (ID: 5555555)
  环境：production
  
⚠️ 写入警告
  将创建新资源到 production 环境
  
📁 扫描文件：./dist/theme.zip
  ✓ 文件格式验证通过
  ✓ SHA1: a1b2c3d4e5f6...

📋 使用 manifest 参数:
  资源类型：react-theme
  标题：MyProductionTheme
  版本号：1.0.0
  ...

✅ 最终确认标志：--yes
  
📊 发布进度
  [██████████] 100% 完成

{
  "event": "result_success",
  "data": {
    "resourceId": "res_ci_prod_001",
    "version": "1.0.0",
    "sha1": "a1b2c3d4e5f6...",
    "url": "https://console.freelog.com/resource/res_ci_prod_001"
  }
}
```

### 错误输出 (结构化 JSON)
```json
{
  "event": "error",
  "code": "AUTH_EXPIRED",
  "message": "Token 已过期，请刷新凭据",
  "recommendation": "更新 FREELG_TOKEN 环境变量",
  "timestamp": "2026-09-02T10:30:00Z"
}
```

---

## F02 - JSON Schema 验证 manifest 结构

```bash
$ cat release-manifest.json
{
  "filePath": "./tutorial/intro-to-react.pdf",
  "resourceType": "general-document",
  "title": "React 入门教程 PDF 指南",
  "name": "docs-writer-react-tutorial",
  "version": "1.0.0",
  "description": "React 入门教程的完整指南",
  "customProperties": {
    "language": "zh_CN",
    "estimatedReads": 5000,
    "difficulty": "beginner"
  },
  "policyTemplate": "free",
  "tags": ["react", "tutorial", "pdf"],
  "intro": "适合初学者的指南",
  "confirmWrite": true,
  "allowOnline": true
}

$ freelog publish --manifest release-manifest.json --validate

{
  "event": "validation_complete",
  "valid": true,
  "schema": "freelog-publish-v1.0",
  "checkedFields": [
    "filePath",
    "resourceType", 
    "title",
    "name",
    "version",
    "customProperties",
    "policyTemplate",
    "tags",
    "confirmWrite",
    "allowOnline"
  ]
}
```

### 验证失败示例
```bash
{
  "event": "validation_error",
  "valid": false,
  "errors": [
    {
      "field": "version",
      "code": "INVALID_SEMVER",
      "message": "版本号不符合 SemVer 规范",
      "value": "1.0"
    },
    {
      "field": "tags",
      "code": "EXCEED_LIMIT",
      "message": "标签数量超过 20 个限制",
      "count": 25
    }
  ]
}
```

---

## F03 - NDJSON 流式输出用于日志收集

```bash
$ CI=true freelog publish --ndjson ./dist/build.zip 2>&1 | tee freelog.log

{"event":"env_check","status":"complete","environment":"dev"}
{"event":"file_scan","status":"complete","path":"./dist/build.zip","size":"2.3MB"}
{"event":"resource_shell","status":"create","resourceId":"res_dev_001"}
{"event":"version_upload","status":"uploading","progress":30}
{"event":"version_upload","status":"uploading","progress":70}
{"event":"version_upload","status":"complete","sha1":"abc123..."}
{"event":"policy_apply","status":"complete","policyId":"pol_free_001"}
{"event":"listing_config","status":"complete","tags":["theme","ui"]}
{"event":"result_success","resourceId":"res_dev_001","version":"1.0.0"}
```

---

## F04 - Plan 阶段只输出计划不执行

```bash
$ freelog publish ./dist/build.zip --plan

{
  "event": "plan_complete",
  "steps": [
    {"step": "env_check", "status": "planned"},
    {"step": "file_scan", "status": "planned", "details": {"path": "./dist/build.zip"}},
    {"step": "resource_shell", "status": "planned", "details": {"type": "react-theme"}},
    {"step": "version_create", "status": "planned", "details": {"version": "1.0.0"}},
    {"step": "upload", "status": "planned"},
    {"step": "policy_apply", "status": "planned"},
    {"step": "listing_config", "status": "planned"}
  ],
  "warnings": [],
  "cost_estimate": {
    "api_calls": 7,
    "cdn_upload": "2.3MB"
  }
}
```

---

## F05 - Dry-run 打印将要执行的步骤

```bash
$ freelog publish ./dist/build.zip --dry-run

[计划执行列表]

1. 环境检查 ✓
   当前环境：dev
   登录账号：liu-kai-github
   
2. 文件扫描 ✓
   路径：./dist/build.zip
   大小：2.3 MB
   
3. 资源壳创建 ⏸
   资源类型：react-theme
   标题：My Production Theme
   授权标识：liu-kai-github-myprod
   
4. 版本上传 ⏸
   版本号：1.0.0
   预计上传：2.3 MB
   
5. 策略配置 ⏸
   模板：免费策略模板
   
6. Listing 配置 ⏸
   标签：theme, ui, production
   
⚠️ 以下操作将被执行:
  • 创建新资源到 dev 平台
  • 上传文件到 CDN
  • 配置策略和 Listing
  
是否真正执行？[y/N]: N

✅ 未执行任何写操作
```

---

## F06 - Checkpoint 在 CI 中的 JSON 错误码

```bash
# CI 环境中Checkpoint 不匹配时的错误
$ CI=true freelog publish --resume ./dist/build.zip

{
  "event": "checkpoint_mismatch",
  "code": "ACCOUNT_ID_MISMATCH",
  "details": {
    "checkpointAccountId": "8847953",
    "currentAccountId": "9999999",
    "checkpointFile": "~/.freelog/checkpoints/publish-xxx.json"
  },
  "recommendation": "Use matching credentials or delete stale checkpoint",
  "options": [
    {"action": "abort", "description": "终止并提示切换账号"},
    {"action": "force_resume", "description": "强制恢复 (不推荐)"},
    {"action": "start_new", "description": "放弃 checkpoint 开始新任务"}
  ]
}
```

### AI 辅助字段补全场景
```bash
$ AI_MODE=true freelog publish ./dist/build.zip

{
  "event": "missing_fields_detected",
  "missingFields": [
    {"field": "tags", "reason": "必填项为空"},
    {"field": "customProperties", "reason": "该类型需要配置属性"}
  ],
  "suggestions": {
    "tags": ["theme", "ui", "component"],
    "customProperties": {
      "themeColor": "blue",
      "layoutType": "grid"
    }
  },
  "question": "请确认是否使用建议值填充缺失字段？"
}
```

---

## 📝 F 组场景发现的设计缺口

| 问题编号 | 场景编号 | 发现的问题 | 建议修订文档 |
|---------|---------|-----------|------------|
| F-01 | F01 | AUTH_EXPIRED 等错误码体系 | 04 节补充"AI-CI 错误码表" |
| F-02 | F02 | JSON Schema 的版本管理 | 09 节补充"Schema 演进策略" |
| F-03 | F04-F05 | Plan/Dry-run 的详细报告格式 | 04 节补充"预检输出协议" |
| F-04 | F06 | Checkpoint 的 AI-CI 错误码 | 06 节补充"CI Checkpoint Interface" |
