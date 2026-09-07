import { CliError } from './errors';

export function notImplemented(): never {
  // i18n: cli.not_implemented
  throw new CliError('未实现', 'NOT_IMPLEMENTED');
}
