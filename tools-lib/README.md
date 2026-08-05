# @freelog/tools-lib

Freelog 公共工具库，提供 API 封装、工具函数、域名/路由生成和国际化能力。

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
