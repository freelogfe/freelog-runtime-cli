# 2026-08-14 L3-H 正式服务链路 dev 验证

> 文档角色：日期化运行证据。本文验证生产服务函数，不代替真实 TTY 菜单验收。

## 运行上下文

- 环境：`dev`
- 代码基线：`6afb41f` 加本轮工作树修复
- 凭据：本机受控 primary + secondary 测试账号；未写入本文
- 命令：`pnpm --filter @freelog-cli/cli verify:l3h-automated`
- 结果：`4 passed / 0 skipped`

## H1 — session 内存凭据与首发

- 启动目录不存在 `.freelog-auth`
- ephemeral 登录后通过正式 `createThenPublish` 首发
- 清理内存登录后仍不存在 `.freelog-auth`
- resourceId：`6a7ecb2cf5749f00306ae00e`
- versionId：`088b1d1c83716c5e46e5f988cb473397`

结论：PASS。

## H2 — session 导出 00 工程

- 通过正式 `ensureSynced` + `exportSessionProject` 导出
- 生成 `freelog.manifest.json` 与 `.freelog/state.json`
- state 中 resourceId 与 H1 一致

结论：PASS。

## H3 — studio 多账号子工程

- H3 直接调用生产 `studioPublishOneFile`，没有在测试中复制发布实现
- primary：resourceId=`6a7ecb2ef5749f00306ae04a`，versionId=`51528cb319d1d17d96eaaff75b878717`
- secondary：resourceId=`6a7ecb2ff5749f00306ae06b`，versionId=`eb684477c73a0fbea1ec680bb7ef1542`
- 两个导出子工程的 owner.userId 不同

结论：PASS。

## H4 — studio owner 门禁

- secondary 账号进入 primary 子工程维护入口
- `assertStudioOwner` 返回 code 2，并提示 owner 不匹配

结论：PASS。

## 证据边界

- 本次覆盖：ephemeral 登录服务、首发、文件上传、Studio 报告状态机、工程导出、owner 门禁。
- 本次不覆盖：Clack 菜单导航、取消操作、终端宽度及人工可读性；仍使用
  [_template-l3h-interactive.md](./_template-l3h-interactive.md) 人工签字。
- dev 环境创建了以上 3 个资源。平台当前没有统一测试资源回收协议，因此保留 ID 供后续识别和清理。
- runner 默认不再向源码目录写可覆盖的 `latest` 结果；如需机器证据，显式传
  `--report <path>`。

