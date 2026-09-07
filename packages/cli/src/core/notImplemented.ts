/** 二期占位：一期不做的命令统一抛 NOT_IMPLEMENTED，防止误用。 */

import { CliError } from './errors';

/** 动作占位：一期没排的命令点进来就报 NOT_IMPLEMENTED。 */
export function notImplemented(): never {
  // i18n: cli.not_implemented
  throw new CliError('未实现', 'NOT_IMPLEMENTED');
}
