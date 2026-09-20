# Step3 - 添加授权策略

第一次发行时，本步可跳过；没有启用策略只会在以后 `online` 时失败，不阻止创建资源壳或首版。创建完成后，策略仍可随时维护。

单资源策略的公共流程、动态参数、TTY 交互、脚本参数、编译预览、读回与异常处理，以 [参数化策略模板](../../../ARCHITECTURE/09-参数化策略模板.md) 为唯一真源。本页只定义首次发行时的目标和入口。

```text
freelog-cli policy template list
freelog-cli policy template info <templateId>
freelog-cli policy template apply <templateId>
```

## 首次发行特有的门禁

- 已 `login`，当前 `N.json` 已绑定本人资源且目标未冻结。
- 不要求 `latestVersion`；刚建壳、尚未创建首版时可以先加策略。
- 当前策略列表为空时提示：「添加并启用授权策略之后，资源才能上架。授权策略也可以稍后添加。」
- 本命令完成后只打印策略读回结果及 `online` 的前置条件，不自动上架。

## 当前模板请求

单资源最终使用 `resourceTypeCodes4Resource: [typeCode]`。当前后端筛选契约故障期间，公共策略层临时请求 `{}` 并展示平台完整返回；恢复后两种主体一起恢复按 typeCode 筛选。不得按免费、付费、事件或本地类型猜测过滤。

## 本步不做

不创建版本、不修改版本工作稿、不写策略参数 JSON、不导入本地策略文本、不支付、不自动上架。手写策略语言是后续独立能力。
