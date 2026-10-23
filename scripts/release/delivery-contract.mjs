/** Registered traceability only; these broad obligations do not claim field-level coverage. */
import { createHash } from 'node:crypto';
import { commandParameterCases } from '../../test/acceptance/command-parameter-cases.mjs';
import { versionLifecycleCases } from '../../test/acceptance/version-lifecycle-evidence.mjs';
import { resourceSyncCases } from '../../test/acceptance/resource-sync-evidence.mjs';
import { resourceManagementCases } from '../../test/acceptance/resource-management-evidence.mjs';
import { consoleRoundtripCases } from '../../test/acceptance/console-roundtrip-evidence.mjs';
import { collectionLifecycleCases } from '../../test/acceptance/collection-lifecycle-evidence.mjs';
import { collectionRecoveryCases } from '../../test/acceptance/collection-recovery-evidence.mjs';
import { collectionItemsCases } from '../../test/acceptance/collection-items-evidence.mjs';
import { collectionSelectionCases } from '../../test/acceptance/collection-selection-evidence.mjs';
import { collectionEditCases } from '../../test/acceptance/collection-edit-evidence.mjs';
import { collectionIdentityCases } from '../../test/acceptance/collection-identity-evidence.mjs';
import { collectionRulesCases } from '../../test/acceptance/collection-rules-evidence.mjs';
import { collectionPublishPreflightCases } from '../../test/acceptance/collection-publish-preflight-evidence.mjs';
import { collectionPublishPreviewCases } from '../../test/acceptance/collection-publish-preview-evidence.mjs';

const design = 'docs/一期/产品方案/脚手架设计';
const fields = 'docs/一期/产品方案/业务梳理/字段级校验对照表.md';
const leaves = [...commandParameterCases, ...versionLifecycleCases, ...resourceSyncCases, ...resourceManagementCases, ...consoleRoundtripCases, ...collectionLifecycleCases, ...collectionRecoveryCases, ...collectionItemsCases, ...collectionSelectionCases, ...collectionEditCases, ...collectionIdentityCases, ...collectionRulesCases, ...collectionPublishPreflightCases, ...collectionPublishPreviewCases];
export const deliveryRules = Object.freeze([
  ['COMMAND.PARAMETER_CONTRACT', [`${design}/COMMANDS.md`]],
  ['VERSION.UPDATE_MATRIX', [`${design}/ARCHITECTURE/05-版本工作稿与独立命令.md`]],
  ['RESOURCE.MANAGEMENT_MATRIX', [`${design}/PHASE/单资源/管理/00-总览.md`]],
  ['COLLECTION.MANAGEMENT_MATRIX', [`${design}/PHASE/合集/README.md`]],
  ['INTEROP.CLI_TO_CONSOLE', [fields, `${design}/PHASE/单资源/版本表单/01-属性.md`]],
  ['INTEROP.CONSOLE_TO_CLI', [fields, `${design}/PHASE/单资源/版本表单/01-属性.md`]],
  ['PLATFORM.SUPPORTED_MATRIX', ['README.md', 'docs/研发交付规范/README.md']],
  ['POLICY.COLLECTION.SELECTED_TEMPLATES', [`${design}/ARCHITECTURE/09-参数化策略模板.md`]],
  ['POLICY.TTY.REAL_PAGINATION', [`${design}/ARCHITECTURE/09-参数化策略模板.md`]],
].map(([id, designPaths]) => {
  const mapped = leaves.filter((leaf) => leaf.parentRule === id);
  return Object.freeze({ id,
    designPaths: Object.freeze([...new Set([...designPaths, ...mapped.flatMap((leaf) => leaf.designRefs.map((ref) => ref.path))])]),
    caseIds: Object.freeze([id, ...mapped.map((leaf) => leaf.id)]),
  });
}));

export function deliveryContractSha256() {
  return createHash('sha256').update(JSON.stringify(deliveryRules)).digest('hex');
}
