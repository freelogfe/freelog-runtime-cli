/** 发版路径参数：`--file` 选身份，`--artifact` 指定这次上传并回写的产物。 */

import { normalizeProjectPath } from '../../local/projectPath';
import type { IdentityRecord } from '../../local/types';

/**
 * 单身份兼容旧的 `--file <新路径>`：只有它不是该身份已记录路径时才把它当产物。
 * 多身份的未匹配 `--file` 会在 resolveIdentity 前失败，因此不会猜测新路径。
 */
export function resolveArtifactPath(
  cwd: string,
  identity: IdentityRecord,
  file?: string,
  artifact?: string,
): string | undefined {
  if (artifact !== undefined) {
    return normalizeProjectPath(cwd, artifact);
  }
  if (file === undefined) {
    return undefined;
  }

  const selector = normalizeProjectPath(cwd, file);
  const recorded = identity.filePath
    ? normalizeProjectPath(cwd, identity.filePath)
    : undefined;
  return selector === recorded ? undefined : selector;
}
