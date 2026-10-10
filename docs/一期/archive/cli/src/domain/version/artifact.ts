/** 发版路径参数：`--resource` 选身份，`--artifact` 指定这次上传并回写的产物。 */

import { normalizeProjectPath } from '../../local/projectPath';
import type { IdentityRecord } from '../../local/types';

/**
 * 身份选择与产物路径严格分离；不保留 `--file` 兼容写法。
 */
export function resolveArtifactPath(
  cwd: string,
  _identity: IdentityRecord,
  _selector?: string,
  artifact?: string,
): string | undefined {
  if (artifact !== undefined) {
    return normalizeProjectPath(cwd, artifact);
  }
  return undefined;
}
