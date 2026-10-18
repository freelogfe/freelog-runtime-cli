/**
 * CLI 进程入口：装配平台（环境、凭据）→ 交给 program 解析执行 → 顶层错误兜底。
 * 未转换异常不得落到 Node 原始堆栈出口；bootstrap 和模块装配失败也复用安全报告。
 */

import { reportCliError } from '../core/errors';

try {
  // 延后加载平台与命令树，使加载过程的异常也被本出口捕获。
  const { bootstrapPlatform } = await import('../platform/bootstrap');
  bootstrapPlatform();
  const { runCli } = await import('./program');
  process.exitCode = await runCli(process.argv, { from: 'node' });
} catch (error) {
  process.exitCode = reportCliError(error, process.argv);
}
