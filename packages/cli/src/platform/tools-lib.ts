/**
 * 经 shim 后再加载 @freelog/tools-lib。
 * 禁止业务文件直接 `import … from '@freelog/tools-lib'`（打包会把 import 提到 shim 之前，
 * 而 npm 0.2.5 顶层仍有 `window.location.hostname`）。
 *
 * 签名对照源码：
 * D:/appinside/freelogfe-web-repos/packages/@freelog/tools-lib/src
 */
import './shim-browser.js';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 变量名包名：避免打包器把 require 静态改写成 hoist 的 import
const TOOLS_LIB_PKG = ['@freelog', 'tools-lib'].join('/');
// createRequire：shim 求值完成后再同步加载（npm 0.2.5 顶层读 window）
const toolsLib = require(TOOLS_LIB_PKG) as typeof import('@freelog/tools-lib');

// 显式注解，避免 dts 追到 tools-lib 内部 axios 路径
export const FServiceAPI: typeof toolsLib.FServiceAPI = toolsLib.FServiceAPI;
export const FUtil: typeof toolsLib.FUtil = toolsLib.FUtil;
export const FI18n: typeof toolsLib.FI18n = toolsLib.FI18n;
