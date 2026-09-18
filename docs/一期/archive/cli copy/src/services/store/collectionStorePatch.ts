import { loadCollectionProject, saveCollectionProject, withProjectWriteLock } from '../../config/project.js';
import type { CollectionProject } from '../../config/project/types.js';
import { assertExpectedBinding, assertExpectedFields } from './remoteWriteGuards.js';
import { mergeProjectPatch } from '../../config/project/projects.js';

/** 合集平台写入后的最小本地 patch；保持 revision 与 binding 校验集中。 */
export function saveCollectionProjectPatch(
  patch: Partial<CollectionProject>,
  cwd?: string,
  options: { expected?: Partial<CollectionProject>; expectedResourceId?: string } = {},
): void {
  withProjectWriteLock(cwd, () => {
    const current = loadCollectionProject(cwd).data;
    assertExpectedBinding(current.resourceId, options.expectedResourceId);
    assertExpectedFields(current, options.expected, patch);
    saveCollectionProject(mergeProjectPatch(current, patch), cwd);
  });
}
