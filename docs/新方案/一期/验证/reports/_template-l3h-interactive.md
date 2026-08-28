# L3-H 交互壳 TTY 验收模板

环境：`--env dev` · 真实 TTY · 测试日期：________

## H1 — session 无落盘凭据

- [ ] 启动前 cwd 无 `.freelog-auth`
- [ ] `freelog-cli session --env dev` 内存登录成功
- [ ] 搜索并选中资源
- [ ] 发新版成功
- [ ] 退出后仍无 `.freelog-auth`

resourceId=________ 结论=□通过 □差异（________）

## H2 — session 导出转 00

- [ ] 菜单「导出工程」→ 空目录
- [ ] 生成 `freelog.manifest.json` + `.freelog/state.json`
- [ ] `cd` 导出目录 + `login` 后可 `status`

exportDir=________ 结论=________

## H3 — studio 多账号子工程

- [ ] 账号 A 发行子目录 A（owner=A）
- [ ] 切换账号 B 发行子目录 B（owner=B）
- [ ] 两目录 owner 字段不同

dirA=________ dirB=________ 结论=________

## H4 — studio owner 门禁

- [ ] 账号 B 进入 A 的子工程维护
- [ ] 拒绝（code 2）并提示切换账号

结论=________

## 签字

| 检查人 | 日期 | 总评 |
|---|---|---|
| | | □通过 □差异 |
