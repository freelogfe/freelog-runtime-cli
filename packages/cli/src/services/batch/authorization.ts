import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { mergeDeclaredAuthSubjects } from '../authorizationTree.js';
import { assertAuthMapMatchesDependencies } from '../depAuthService.js';
import type { PreparedFile } from './types.js';

/** 对齐 Console creatorBatch Card：isCompleteAuthorization + batchSignContracts。 */
export function assertBatchItemAuthorizationReady(item: PreparedFile): void {
  const declared = mergeDeclaredAuthSubjects(item.dependencies, item.baseUpcastResources);
  if (declared.length === 0) return;

  const batchSign = item.batchSignContracts || [];
  if (!batchSign.length) {
    throw cliError(I18N_KEYS.batch_authorization_incomplete, {
      code: 5,
      details: {
        filename: item.filename,
        name: item.name,
        resourceTitle: item.resourceTitle,
        missingSubjectIds: declared.map((row) => row.resourceId),
      },
      hint: '在 freelog.batch.json 为该条目声明 batchSignContracts（含 dependencies 与 baseUpcastResources 的全部 resourceId）',
    });
  }

  assertAuthMapMatchesDependencies(
    {
      contracts: batchSign.map((entry) => ({
        resourceId: entry.resourceId,
        policyIds: entry.policyIds,
      })),
    },
    declared,
  );
}

export function assertPreparedBatchAuthorization(prepared: PreparedFile[]): void {
  const unresolved: Array<{
    filename: string;
    name: string;
    resourceTitle: string;
    missingSubjectIds: string[];
    reason: string;
  }> = [];

  for (const item of prepared) {
    const declared = mergeDeclaredAuthSubjects(item.dependencies, item.baseUpcastResources);
    if (declared.length === 0) continue;

    const batchSign = item.batchSignContracts || [];
    if (!batchSign.length) {
      unresolved.push({
        filename: item.filename,
        name: item.name,
        resourceTitle: item.resourceTitle,
        missingSubjectIds: declared.map((row) => row.resourceId),
        reason: 'BATCH_SIGN_CONTRACTS_MISSING',
      });
      continue;
    }

    try {
      assertAuthMapMatchesDependencies(
        {
          contracts: batchSign.map((entry) => ({
            resourceId: entry.resourceId,
            policyIds: entry.policyIds,
          })),
        },
        declared,
      );
    } catch (error) {
      const missingSubjectIds = declared
        .map((row) => row.resourceId)
        .filter((resourceId) => !batchSign.some((entry) => entry.resourceId === resourceId));
      unresolved.push({
        filename: item.filename,
        name: item.name,
        resourceTitle: item.resourceTitle,
        missingSubjectIds,
        reason:
          error instanceof Error && /undeclared|duplicate|policy/i.test(error.message)
            ? 'BATCH_SIGN_CONTRACTS_INVALID'
            : 'BATCH_SIGN_CONTRACTS_INCOMPLETE',
      });
    }
  }

  if (unresolved.length === 0) return;

  throw cliError(I18N_KEYS.batch_authorization_incomplete, {
    code: 5,
    details: { unresolvedItems: unresolved },
    hint: '对齐 Console 批量发行：每项 dependencies/baseUpcastResources 须在 batchSignContracts 中完整列出 policyIds',
  });
}
