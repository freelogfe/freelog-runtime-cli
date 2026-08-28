# Freelog Runtime CLI

Freelog Runtime CLI 是面向本地资源工程的命令行工作台：对齐 Console 的业务语义和平台约束，并补充模板初始化、类型驱动打包、批量处理、结构化输出与失败恢复等 CLI 原生能力。

项目当前处于开发阶段，不维护旧命令、旧字段或旧文档兼容层。

## 从这里开始

- 产品设计唯一真源：[DESIGN.md](./DESIGN.md)
- 文档职责与阅读顺序：[docs/README.md](./docs/README.md)
- 手动测试入口：[docs/新方案/一期/验证/手动测试.md](./docs/新方案/一期/验证/手动测试.md)
- 代码分层说明：[packages/cli/src/ARCHITECTURE.md](./packages/cli/src/ARCHITECTURE.md)
- 自动验证素材与账号变量：[test/README.md](./test/README.md)

## 本地验证

```bash
pnpm install
pnpm verify
pnpm --filter @freelog-cli/cli2 verify:console-forms
```

涉及 dev 平台写操作的场景不会进入默认本地门禁；执行前按测试文档提供环境变量，并在仓库外的临时目录中测试。
