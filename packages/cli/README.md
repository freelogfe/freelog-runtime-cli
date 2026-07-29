# `@freelog-cli/cli`

Freelog CLI（目标态）。设计：[`docs/新方案/`](../../docs/新方案/)。

依赖 `@freelog/tools-lib`（**支付除外**；签约走 `dep auth` / Console）。版本线 `0.5.x`。

## 仓库布局

```text
packages/
  cli/                 # @freelog-cli/cli
  templates/           # @freelog-cli/template-*
```

## 开发

```bash
pnpm install
pnpm --filter @freelog-cli/cli check:compat
pnpm --filter @freelog-cli/cli build
pnpm --filter @freelog-cli/cli test
```

## 命令面（边界 A）

| 组 | 命令 |
|----|------|
| 全局 | `login` `logout` `status` `pull` `init` |
| 单品 | `create` `updateVersion` `publish` `draft *` `dep *` `policy *` `update` `online` `offline` `version edit` `contract list` |
| 合集 | `collection create\|item\|update\|policy\|publish\|unpublish\|collect-rules\|rss\|logs` |
| 草稿 | `draft push\|pull\|discard`；合集表单加 `--collection` |

### 单品主路径

```bash
freelog-cli login --login-name … --password … --yes
freelog-cli create --title "…" --type <code> --yes
freelog-cli updateVersion --version 1.0.0 --filePath dist --runtime 0.5 --yes
freelog-cli draft push [--upload] [--force] --yes
freelog-cli publish [--bump] --yes
freelog-cli policy add --from-file ./policy.json --yes
freelog-cli online --yes
```

### 批量单品 / 合集

```bash
freelog-cli create --from-dir ./photos --type <code> --title-prefix "照片" --yes
freelog-cli collection create --title "合集" --type <code> --yes
freelog-cli collection item add <resourceId|./path>
freelog-cli collection publish --yes
freelog-cli collection rss send-code <feedUrl>
freelog-cli collection rss bind <feedUrl> --code <邮箱码> --yes
```

### 依赖签约（非支付）

```bash
freelog-cli dep auth --policy-map ./auth-map.yaml --yes
freelog-cli contract list --json
```

### 打包规则

| 类型 | filePath | 行为 |
|------|----------|------|
| 主题/插件/软件库 | 目录 | AdmZip → 临时 zip → 上传 → 清理 |
| 其它 | 文件 | 直接上传 |

### 明确不做

- 支付 API / 支付命令（其它库后续接入）
- 浏览器微应用 / Console 防抖自动草稿
- 旧入口：`batch *` / `syncr` / `publish --draft`

### 真机联调

需测网账号人工验证：create→publish→online、draft 跨端、from-dir、合集 item→publish、RSS bind、dep auth。未跑通前不得标「已验收」。
