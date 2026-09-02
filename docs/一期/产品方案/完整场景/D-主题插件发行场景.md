# D 组：主题/插件完整发行场景（7 个深度场景）

> **目标**: 验证主题/插件类资源的特殊发行流程
> 
> **关键差异**: 与普通资源相比，主题/插件有节点激活、插件依赖等特殊要求

---

## D01 - React 主题首次发布（含节点激活接力）

**用户画像**: 主题开发者，发布 React 主题到 Freelog  
**前置条件**: 
- 已完成构建：`./dist/my-theme.zip`
- 该主题是"节点展品主题"，需额外激活步骤

```bash
$ freelog publish ./dist/my-theme.zip

📁 文件扫描
  路径：./dist/my-theme.zip
  大小：2.3 MB
  
📋 资源类型选择
  
💡 根据文件名和包结构检测:
  这是一个 React 主题工程
  
可用类型:
  [推荐] 节点主题 → React 展品主题
    • 支持节点关联
    • 需要 Console 激活
      
  [普通] 主题 → React 主题
    • 普通主题资源
    • 无需节点激活

请选择：[回车使用推荐] ↵

✅ 选择的类型:
  名称：React 展品主题
  代码：node-exhibit-theme
  subjectType: 1 (普通资源)
  特殊要求：需要节点激活

┌─ 第 1 步 / 共 4 步：基础信息 ──────┐
│                                  │
│ 资源标题：My Amazing Theme      │
│ 授权标识：liu-kai-github-mytheme│
│                                  │
│ ⚠️ 重要提示                       │
│                                  │
│ 这是一个节点展品主题             │
│ 发布后需要在 Console 激活节点关联│
│                                  │
│ [下一步：版本信息]              
└──────────────────────────────────┘

... [后续流程与普通资源相同] ...

🎯 最终确认

资源标题：My Amazing Theme
类型：React 展品主题 (节点主题) ⚠️
版本号：1.0.0
策略：免费策略模板

⚠️ 特别警告

这是一个节点主题，仅完成 CLI 发行流程还不够。

发布完成后，您需要:
  1. 打开 Console
  2. 导航到「节点管理」→「待激活主题」
  3. 找到"My Amazing Theme"
  4. 关联目标节点并激活

是否继续发布？[y/N]: y

📊 发布进度
  [...] 100% 完成

✅ 发布成功！

资源详情:
  资源 ID: res_node_theme_001
  资源 URL: https://console.freelog.com/resource/res_node_theme_001

🔄 Console 接力信息

下一步操作：激活节点关联

快速链接:
  https://console.freelog.com/node/themes?action=activate&resourceId=res_node_theme_001&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

携带信息:
  - resourceId: res_node_theme_001
  - owner: liu-kai-github
  - autoFill: true
  
💡 提示：复制上述链接到浏览器即可自动填充主题信息，只需确认即可激活
```

### 异常分支 D01-1: 未激活前无法上架

```bash
# 尝试在节点激活前上架
$ freelog resource set-status res_node_theme_001 --on-shelf

❌ NODE_NOT_ACTIVATED: 节点主题未激活

当前状态:
  资源 ID: res_node_theme_001
  类型：React 展品主题
  节点关联：未激活
  
限制:
  • 不能上架到公开市场
  • 只能自己查看
  
解决方案:
  1. 使用 Console 激活节点
  2. 或使用以下命令打开激活页面:
     $ freelog node activate --resource-id res_node_theme_001
```

---

## D02 - Vue 主题首次发布

```bash
$ freelog publish ./dist/vue-theme.zip

📋 资源类型选择
  检测到 Vue 项目结构
  
  可选类型:
    [1] 节点主题 → Vue 展品主题
    [2] 普通主题 → Vue 主题
    
请选择：[1]

✅ 选择：节点主题 → Vue 展品主题

... [发布流程] ...

✅ 发布成功!

💡 Vue 主题特别提示:
  - 建议使用 Vite 构建
  - 注意 Vue 2 vs Vue 3 的兼容性声明
  - peerDependencies 中应声明 Vue 版本范围
```

---

## D03 - 功能插件首次发布

**用户画像**: 插件开发者，创建可被主题依赖的功能插件

```bash
$ freelog publish ./dist/my-plugin.zip

📋 资源类型选择
  检测到 plugin-manifest.json
  
  可选类型:
    [1] 功能插件 (推荐)
        • 可提供功能模块
        • 可被主题依赖
        
    [2] UI 组件插件
        • 提供 UI 组件库
        
请选择：[1]

✅ 选择：功能插件

┌─ 插件配置 ──────────────────┐
│                              │
│ 插件元数据检测:              │
│   名称：My Plugin           │
│   作者：liu-kai-github       │
│   依赖：React >=17.0.0       │
│                              │
│ peerDependencies 检测:      │
│   • React ^18.0.0            │
│   • ReactDOM ^18.0.0         │
│                              │
│ 这些将作为插件的运行时依赖   │
│ 要求在安装时被满足           │
│                              │
│ [确认并使用] [手动调整]      
└────────────────────────────────┘

用户选择：[确认并使用]

✅ 插件已配置
  运行时依赖:
    - React ^18.0.0 (资源 ID: res_react_official)
    - ReactDOM ^18.0.0 (资源 ID: res_react-dom_official)

... [继续发布流程] ...

✅ 发布成功!

💡 插件使用提示:
  其他主题如需使用此插件
  需在依赖关系中添加此资源 ID
  并满足版本范围要求
```

---

## D04 - 主题/插件的新版本维护

```bash
$ freelog update res_node_theme_001 ./dist/update.zip

🔍 加载远端资源信息
  资源 ID: res_node_theme_001
  类型：React 展品主题
  Owner: liu-kai-github ✓
  
  当前版本：1.0.0
  节点激活状态：已激活

📁 差异检测
  SHA1 变化：old_sha1... → new_sha1...
  
┌─ 版本元数据继承 ─────────┐
│                          │
│ 继承自 v1.0.0:          │
│   ✓ 资源标题            │
│   ✓ 自定义属性          │
│   ✓ 策略配置            │
│                          │
│ 需要更新：              │
│   • 版本号：1.0.0 → ?   │
│   • 文件内容            │
│   • 版本描述            │
│                          │
│ [继承全部] [逐项编辑]    
└────────────────────────────┘

用户选择：[继承全部]

✅ 新版本上传成功
  版本号：1.0.1
  文件大小：2.4 MB
  
💡 节点主题特别提醒:
  如果更新了主题的核心逻辑
  可能需要通知已使用该主题的所有节点更新
```

---

## D05 - 插件依赖关系管理

**场景**: 修改主题的依赖关系，增加新插件

```bash
$ freelog dependency add res_my_theme --depends-on res_my_plugin --range "^1.0.0"

🔍 检查依赖关系变更
  
当前主题依赖:
  - res_plugin_a ^2.0.0
  - res_plugin_b ~1.5.0

即将新增依赖:
  + res_plugin_c ^1.0.0

影响评估:
  ✓ 插件存在且可访问
  ✓ 版本范围合法
  ✓ 无循环依赖风险

⚠️ 依赖变更影响:
  • 用户使用该主题时需要先安装 res_plugin_c
  • 如果插件不满足版本范围可能报错
  
是否继续添加？[Y/n]: Y

✅ 依赖关系更新成功

新的依赖列表:
  - res_plugin_a ^2.0.0
  - res_plugin_b ~1.0.0
  - res_plugin_c ^1.0.0 ← 新增

📊 依赖审计报告:
  生成时间：2026-09-02T17:00:00Z
  审计结果：无风险
```

### 异常分支 D05-1: 版本范围不命中

```bash
$ freelog dependency add res_my_theme --depends-on res_plugin_c --range "^2.0.0"

❌ DEPENDENCY_MISMATCH: 版本范围不匹配

需求:
  主题要求：res_plugin_c ^2.0.0
  
实际可用版本:
  res_plugin_c 的最新版本：1.5.3
  
问题:^2.0.0 无法匹配 1.5.3

解决方案:
  A) 降低版本范围要求：^1.5.0
  B) 升级插件到 >=2.0.0
  C) 排除该依赖
  
您选择：[A]

新的版本范围：^1.5.0
✅ 验证通过
```

---

## D06 - 主题节点激活接力（Console 侧完整流程）

**场景**: 用户在 CLI 发布后，切换到 Console 完成激活

```bash
# CLI 输出的接力链接
$ freelog publish ./dist/theme.zip

✅ 发布成功!
资源 ID: res_node_theme_001

🔄 接力信息
  请在 Console 完成节点激活:
  https://console.freelog.com/node/themes?auto=res_node_theme_001&token=xxx...

# 用户在 Console 的操作流程:

1. 打开 Console → 登录 liu-kai-github
  
2. 导航到：节点管理 → 待激活主题
  
3. 看到待激活项:
   ├─ My Amazing Theme (ID: res_node_theme_001)
   │   类型：React 展品主题
   │   版本：1.0.0
   │   上传时间：刚刚
   
4. 点击进入激活页面
   
5. 配置节点关联:
   ├─ 选择目标节点：Node_A
   │   环境：production
   │   域名：example.com
   ├─ 预览效果
   └─ [确认激活]
   
6. 激活成功提示:
   ✅ 主题已成功关联到 Node_A
   
   生效时间：立即
   访问地址：https://example.com
   
7. 验证部署:
   ✓ 主题 CSS 正常加载
   ✓ JS 无报错
   ✓ 节点标志显示正确
```

---

## D07 - 主题/插件的资源类型树定位

```bash
$ freelog type list --filter theme

📦 主题类资源类型

顶级分类：主题
  ├─ 节点主题 (需要激活)
  │   ├─ React 展品主题
  │   ├─ Vue 展品主题
  │   └─ 通用主题
  │
  └─ 普通主题
      ├─ React 主题
      ├─ Vue 主题
      └─ Angular 主题

详细信息:
  React 展品主题:
    代码：node-exhibit-react
    subjectType: 1
    supportCollectionImport: true
    minVersion: 1.0.0
    
    特殊要求:
      • 必须经过节点激活才能上架
      • 支持 peerDependencies
      • 需要声明 Vue/React 版本范围
  
  React 主题:
    代码：theme-react
    subjectType: 1
    supportCollectionImport: true
    minVersion: 1.0.0
    
    无特殊激活要求
```

---

## 📝 D 组场景发现的设计缺口

| 问题编号 | 场景编号 | 发现的问题 | 建议修订文档 |
|---------|---------|-----------|------------|
| D-01 | D01 | 节点激活的接力信息格式 | 04 节补充"Console 接力协议" |
| D-02 | D04 | 节点主题版本更新的特殊说明 | 02 节字段约束补充"节点主题列" |
| D-03 | D05-D06 | 依赖管理的审计机制 | 02 节补充"依赖关系表" |
| D-04 | D07 | 资源类型树的层级关系 | 02 节补充"类型树结构" |

---

继续阅读下一组场景：E-合集与 RSS 自动化场景...
