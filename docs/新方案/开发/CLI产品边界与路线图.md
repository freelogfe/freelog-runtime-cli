# CLI 产品边界与路线图

最后更新：2026-08-10

**读者：** 产品、开发  
**关系：** Console 对齐见 [Console对齐核对报告](../对齐/Console对齐核对报告.md)；本文回答「CLI 作为命令行工具还应有什么、不应有什么」。

---

## 1. CLI 定位（一句话）

**本地工程 + 可脚本化 + 可恢复** 的 Freelog 发版工具——不是 Console 的完整替代品。

| 维度 | CLI 主战场 | Console 主战场 |
|---|---|---|
| 工作面 | 本地文件、manifest、Git、CI | 浏览器向导、列表、运营 |
| 批量 | `import-dir`、retry | creatorBatch Task |
| 工程起点 | `init theme/widget` 模板 | 上传已有 zip |
| 上架 | 严格 `online` 门禁 | Step4 可软上架 |
| 草稿 | 显式 `draft push` | 300ms 自动存 |

---

## 2. 已落地（2026-08-10）

| 能力 | 命令 | 说明 |
|---|---|---|
| **发版前预检** | `validate` / `doctor` | 登录、manifest、文件、owner、semver、online 门禁 |
| **资源发现** | `resource search <关键词>` | 按授权名/标题搜索，便于 `bind` |
| **CI 环境保护** | 写 API 服务入口 | 非 TTY 且默认 production 时拒绝；须 `--env` / `--test` / `FREELOG_ENV` |
| **manifest vs 平台** | `diff` | listing、版本意图、草稿、online 门禁 |
| **发版流水线** | `release` | validate → build → bump → publish → online |
| **仅 bump 版本** | `version bump` | patch/minor/major，只改 manifest |
| **批量 NDJSON** | `resource import-dir --json-lines` | CI 逐行进度 |
| **Shell 补全** | `completion bash\|zsh` | eval 注入 |
| **meta 开发命令** | `FREELOG_DEV=1` 时注册 | 日常 `freelog-cli --help` 不展示 |
| **批量 ignore** | `.freelogignore` / `.freelog/ignore` | import-dir / media 扫描跳过 junk |
| **项目默认 env** | `.freelog/config.json` + `config set/show/init` | CI 可少传 `--env` |
| **策略/依赖模板** | `policy init` / `dep init-auth-map` | 生成 policy.free.json、auth-map.yaml |
| **monorepo 扫描** | `workspace list` | 列出子目录 manifest |
| **合集 release** | `release`（合集 cwd） | validate → collection publish → online |
| **git changelog** | `release --changelog-from-git` | 最近 commit 写入 description |

**validate 用法：**

```bash
freelog-cli validate --env dev
freelog-cli validate --for online --env dev
freelog-cli doctor --json --env dev
```

**release / diff / bump：**

```bash
freelog-cli diff --env dev
freelog-cli version bump patch --env dev
freelog-cli release --bump patch --build-cmd "npm run build" --yes --env dev
freelog-cli release --bump patch --online --yes --env dev   # 须已通过 policy + 门禁
freelog-cli release --changelog-from-git --yes --env dev    # 单品或合集
freelog-cli config init --default-env dev                 # 项目模板
freelog-cli workspace list                                # monorepo 扫描
freelog-cli policy init && freelog-cli dep init-auth-map
```

**CI 推荐：**

```bash
freelog-cli validate --for publish --env dev --json || exit 1
freelog-cli release --bump patch --build-cmd "npm run build" --yes --env dev
```

**批量 import NDJSON：**

```bash
freelog-cli resource import-dir ./clips --resource-type RT006003 --json-lines --yes --env dev
# {"event":"start","total":3}
# {"event":"ok","index":0,"file":"a.mp4",...}
# {"event":"done","ok":3,"fail":0,"total":3}
```

**Shell 补全：**

```bash
eval "$(freelog-cli completion bash)"   # bash
eval "$(freelog-cli completion zsh)"    # zsh
```

---

## 3. 建议增加（按优先级）

### P1 — 减少命令拼乐高

| 能力 | 状态 |
|---|---|
| **`release` 流水线** | ✅ 已落地 |
| **`diff`** | ✅ 已落地 |
| **`version bump patch\|minor`** | ✅ 已落地 |
| **import `--json-lines`** | ✅ `resource import-dir --json-lines` |
| **Shell 补全** | ✅ `freelog-cli completion bash\|zsh` |

### P2 — 工程化

| 能力 | 状态 |
|---|---|
| `policy init` / `dep init-auth-map` | ✅ 已落地 + E2E **S2P2** |
| `.freelogignore` | ✅ import-dir / media 扫描 + E2E **S2P2** |
| 项目级 `.freelog/config.json` | ✅ `config set/show/init` + E2E **S2P2** |
| monorepo 工作区扫描 | ✅ `workspace list` + E2E **S2P2** |

### P3 — 体验

| 能力 | 状态 |
|---|---|
| 封面本地预处理提示 | 📄 文档级（见普通用户手册 §6） |
| changelog 从 git 生成 description | ✅ `release --changelog-from-git` |
| 合集 `release` | ✅ 与单品共用命令（不支持 `--bump`） |

---

## 4. 建议减少 / 收拢

| 项 | 建议 | 理由 |
|---|---|---|
| **meta** | 已隐藏；仅 `FREELOG_DEV=1` | 验证工具，非作者日常 |
| **RSS/collect-rules** | 保留命令，文档标「维护/advanced」 | 非本地发版主链路 |
| **双套 policy 子命令** | 长期合并为 `policy --collection` | 降低记忆成本 |
| **草稿三态** | 保留能力；默认路径靠 `status`/`validate` 提示 | Console 模型直译过重 |

---

## 5. 明确不做（CLI 特性，非缺口）

- 云存储选文件、Markdown/Cartoon 微应用、付费收银台  
- 列表/收藏/收入/节点运营  
- 视频转码、封面裁剪 UI、软上架、自动防抖草稿  
- 改已有策略正文（平台同限）

---

## 6. 与 Console 对齐的关系

```text
Console parity = 能力下限（同 API、同平台状态）
CLI 合理性   = 在 parity 之上，更好脚本化、更可预判失败、更本地优先
```

新增 Console 写入能力 → 仍须进 parity 表。  
新增 CLI 原生能力（validate、release、模板）→ 进本文 §2/§3，**不**算 Console 缺口。

---

## 7. 维护

- 新 P0/P1 能力落地后更新 §2  
- 产品经理对外范围仍以 [产品经理简明手册](../使用/产品经理简明手册.md) 为准
