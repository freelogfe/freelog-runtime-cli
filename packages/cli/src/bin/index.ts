/**
 * CLI 进程入口：装配平台（环境、凭据）→ 交给 program 解析执行 → 顶层错误兜底。
 * CliError 只打中文 message（--json 时输出 {code,message}）；非 CliError 直接抛出，便于暴露 bug。
 */

import { bootstrapPlatform } from '../platform/bootstrap';
import { runCli } from './program';

bootstrapPlatform();
process.exitCode = await runCli(process.argv, { from: 'node' });
