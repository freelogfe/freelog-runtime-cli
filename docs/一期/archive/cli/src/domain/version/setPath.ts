/** version set 领域层：只改唯一身份的 filePath；不打 zip、不上传、不发版。 */

import { CliError } from '../../core/errors';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { resolveIdentity, validateLocalState } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord } from '../../local/types';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { assertArtifactAnchor } from './zip';

function sameOrNestedPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** 两个文件相同冲突；任一目录包含另一个锚点也冲突，避免主题构建树被拆给两份资源。 */
function artifactsOverlap(
  first: { path: string; isDirectory: boolean },
  second: { path: string; isDirectory: boolean },
): boolean {
  if (first.path === second.path) return true;
  return (first.isDirectory || second.isDirectory)
    && (sameOrNestedPath(first.path, second.path) || sameOrNestedPath(second.path, first.path));
}

/** 改 filePath 记录：锁内只接受现存、与资源类型匹配的产物锚点。 */
export function setIdentityFilePath(
  cwd: string,
  input: { file?: string; artifact?: string },
): IdentityRecord {
  return withProjectLock(cwd, () => {
    const artifact = input.artifact !== undefined
      ? normalizeProjectPath(cwd, input.artifact)
      : undefined;
    if (!artifact) {
      throw new CliError('请提供 --artifact', 'SET_ARTIFACT_REQUIRED');
    }
    const identity = resolveIdentity(cwd, input.file);
    const absoluteArtifact = path.resolve(cwd, artifact);
    assertArtifactAnchor(identity.typeCode, absoluteArtifact, cwd);
    const nextArtifact = {
      path: resolveExistingProjectPath(cwd, absoluteArtifact),
      isDirectory: statSync(absoluteArtifact).isDirectory(),
    };
    const occupant = validateLocalState(cwd).find((candidate) => {
      if (candidate.n === identity.n) return false;
      const candidatePath = path.resolve(cwd, normalizeProjectPath(cwd, candidate.filePath));
      // 已移动的其它默认产物仍可被保留和后续修复；不存在就没有实际路径占用。
      if (!existsSync(candidatePath)) return false;
      return artifactsOverlap(nextArtifact, {
        path: resolveExistingProjectPath(cwd, candidatePath),
        isDirectory: statSync(candidatePath).isDirectory(),
      });
    });
    if (occupant) {
      throw new CliError(`产物路径 ${artifact} 已被 ${occupant.n}.json 占用`, 'SET_ARTIFACT_OCCUPIED');
    }
    const updated = prepareIdentityUpdate(cwd, identity.n, { filePath: artifact });
    commitLocalTransaction(cwd, [
      { path: identityFilePath(cwd, updated.n), content: serializeIdentity(updated) },
    ]);
    return updated;
  });
}
