# @freelog/tools-lib

本仓包名为`@freelog-cli/tools-lib2`，由Console仓库的`packages/@freelog/tools-lib`适配而来；下文上游包名示例用于说明入口结构，本仓消费者使用`@freelog-cli/tools-lib2/node`。

Freelog 公共工具库，提供 API 封装、工具函数、域名/路由生成和国际化能力。

## 与 Console 上游同步

同步规则见[研发规范](../../docs/研发交付规范/README.md)。核对实际源码和调用方，不按包版本号判断是否一致，也不整目录覆盖Node适配。

2026-10-20核对上游提交`3803cb60076744fd3aeb0e7b2d2568d6f2f4150f`：补齐活动最近任务记录查询、版本创建`coverImages`、用户资料`creatorName`及RSS对比必需`verificationCode`。请求封装保持上游方法/路径/参数，Node二进制/流、鉴权及合集身份类型扩展保留。浏览器国际化同步字面key、富文本及缓存刷新通知，Node仍为纯文本且惰性初始化。

同步这些公共能力不表示CLI新增了活动、RSS、支付、签约或封面编辑命令，也不承诺未执行的真网业务已通过。回归从实际TS模块与类型边界验证，离线替换网络/平台导入；发布仍使用仓库固定候选流程。

该包已拆分 browser / node 双运行时入口。新代码必须选择显式入口：

- 浏览器 React 项目：`@freelog/tools-lib/browser`
- Node CLI / 脚手架：`@freelog/tools-lib/node`
- 根入口 `@freelog/tools-lib` 是迁移期 browser alias，不作为新代码入口。

## 安装

```bash
pnpm add @freelog/tools-lib
```

Monorepo 内部通过 `workspace:*` 引用，无需手动安装。

## 浏览器入口

```typescript
import { FUtil, FServiceAPI, FI18n } from '@freelog/tools-lib/browser';
```

浏览器入口行为：

- 环境从 `window.location.hostname` 推导。
- API 请求使用 Cookie 会话，`withCredentials: true`。
- 未登录/冻结账号保持浏览器跳转行为。
- `FUtil.Hook.useGetState()` 可用。
- `FI18n.i18nNext.tAuto()` 可返回字符串或 React 节点。

## Node 入口

```typescript
import { FUtil, FServiceAPI, FI18n } from '@freelog/tools-lib/node';

FUtil.configurePlatform({
  getEnv: () => 'test',
  getAuthorization: () => process.env.FREELOG_TOKEN,
  getUserId: () => Number(process.env.FREELOG_UID || -1),
});
```

Node 入口行为：

- 不加载 React、js-cookie、html-react-parser。
- 不读取 `window` / `document` / `localStorage`。
- API 请求通过 `Authorization` header 鉴权，`withCredentials: false`。
- `FI18n.i18nNext.tAuto()` 返回字符串。
- 导入Node入口不会创建国际化实例或请求OSS；首次显式访问 `FI18n.i18nNext` 才创建并沿现有流程初始化，之后复用该实例。只使用API/工具、CLI的help或参数拒绝不应触发国际化网络。browser入口行为不变。
- `FUtil.Hook` 不导出。

| 命名空间 | 说明 |
|----------|------|
| `FServiceAPI` | 后端接口封装（Resource / User / Contract / Node / Transaction 等） |
| `FUtil` | 工具函数集合（Format / Tool / LinkTo / Predefined / Regexp / Hook） |
| `FI18n` | 国际化（基于 i18next，翻译文件从 OSS 加载） |

### FServiceAPI 模块

| 模块 | 用途 |
|------|------|
| `Resource` | 资源 CRUD、版本管理 |
| `Collection` | 合集管理 |
| `User` | 登录/登出、用户信息、头像上传 |
| `Node` | 节点 CRUD |
| `Exhibit` | 展品管理 |
| `Contract` | 合约管理 |
| `Transaction` | 交易记录 |
| `Storage` | 存储空间和对象 |
| `Policy` | 授权策略 |
| `Activity` | 活动 |
| `Captcha` | 验证码 |
| `Payment` | 支付 |
| `Statistic` | 统计 |
| `ResourceType` | 资源类型 |
| `Operation` | 运营 |

### FUtil 模块

| 模块 | 用途 |
|------|------|
| `Format` | `humanizeSize`、`formatDateTime`、`completeUrlByDomain` |
| `Tool` | `getUserIDByCookies`、`getAvatarUrl`、`getSHA1Hash` |
| `LinkTo` | 各站点路由生成（`login`、`resourceDetails`、`nodeManagement` 等） |
| `Predefined` | 常量和枚举（`pageSize`、`EnumContractStatus` 等） |
| `Regexp` | 正则工具 |
| `Hook` | React hooks（`useGetState` 等，仅 browser 入口） |

### FI18n

```typescript
FI18n.i18nNext.t('key');              // 翻译
FI18n.i18nNext.tJSXElement('key');    // 翻译并解析 HTML 为 JSX
FI18n.i18nNext.changeLanguage('en');  // 切换语言
FI18n.i18nNext.ready();              // 初始化（加载翻译文件）
```

## 开发

```bash
# 从 tools-lib 包目录
pnpm run dev    # watch 模式
pnpm run build  # 一次性构建
```

## 构建

使用 tsup，输出 browser / node 双入口 CJS + ESM + 类型声明：

```bash
pnpm run build
```
