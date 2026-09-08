# Freelog Runtime CLI

Freelog Runtime CLI 是面向本地资源工程的命令行工作台：对齐 Console 的业务语义和平台约束，并补充模板初始化、类型驱动打包、批量处理、结构化输出与失败恢复等 CLI 原生能力。

项目当前处于开发阶段，不维护旧命令、旧字段或旧文档兼容层。

## 从这里开始

- 产品设计唯一真源：[DESIGN.md](./DESIGN.md)
- 文档职责与阅读顺序：[docs/README.md](./docs/README.md)
- 一期完整产品与实现方案：[docs/一期/产品方案/README.md](./docs/一期/产品方案/README.md)
- 代码分层说明：[packages/cli/src/ARCHITECTURE.md](./packages/cli/src/ARCHITECTURE.md)
- 自动验证素材与账号变量：[test/README.md](./test/README.md)

## 本地验证

```bash
pnpm install
pnpm verify
pnpm --filter @freelog-cli/cli2 verify:console-forms
```

涉及 dev 平台写操作的场景不会进入默认本地门禁；执行前按测试文档提供环境变量，并在仓库外的临时目录中测试。

## 发布 CLI

发布的是 `@freelog-cli/cli2`，npm registry 为 `https://registry.npmjs.org/`。发布命令只会发布 CLI 包，不会发布模板或私有工作区库。

### 发布前条件

- 已使用 Node.js 20+ 与本仓库锁定的 pnpm 版本完成 `pnpm install`。
- npm 账号拥有 `@freelog-cli` scope 的发布权限。
- `packages/cli/package.json` 的 `version` 是尚未发布的版本；npm 不允许覆盖同一版本。

先登录并确认权限：

```powershell
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

发布前可比较本地与 npm 上的版本。若二者相同或本地版本更低，先手动修改 `packages/cli/package.json` 的 `version`；不要用会自动创建 Git tag 的命令替代这一步。

```powershell
node -p "require('./packages/cli/package.json').version"
npm view @freelog-cli/cli2 version --registry=https://registry.npmjs.org/
```

### 发布

```powershell
# 只校验，不会写入 npm
pnpm release:check

# 校验通过后发布到 npm
pnpm release
```

`release:check` 会构建私有工作区依赖、运行 CLI 的测试与类型检查，并以 `npm pack --dry-run` 检查发布清单。`release` 会再次执行这项校验，再运行 `npm publish`。即使直接执行 `npm publish`，`prepublishOnly` 也会强制运行同一校验；标准入口仍应使用 `pnpm release`。

发布包会将工具库代码与 `dist/docs` 使用手册一并带上，不依赖未发布的工作区包。

### 发布后验证

```powershell
npm view @freelog-cli/cli2 version --registry=https://registry.npmjs.org/
npm install --global @freelog-cli/cli2@<刚发布的版本>
freelog-cli --cli-version
freelog-cli --help
```

最后一条必须打印安装包内 `dist/docs/README.md` 的本机绝对路径。

### 常见失败

| 现象 | 处理 |
|---|---|
| `You cannot publish over the previously published versions` | 版本已存在；提高 `packages/cli/package.json` 的版本号后重新从校验开始。 |
| `ENEEDAUTH` 或 `E403` | 重新执行 `npm login`，并确认当前 npm 账号拥有 `@freelog-cli` scope 的发布权限。 |
| `release:check` 失败 | 修复测试、类型检查或打包清单问题；不要绕过校验直接发布。 |
| 安装后提示找不到 `@freelog-cli/tools-lib2` | 不应发生；发布产物必须已捆绑该私有库。重新运行 `pnpm release:check`，确认 tarball 清单和构建通过。 |
