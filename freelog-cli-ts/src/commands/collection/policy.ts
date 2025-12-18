/**
 * collection policy add 命令
 * 为合集添加授权策略（复用资源的策略添加逻辑，但使用合集配置）
 */

import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadCollectionConfig,
  saveCollectionConfig,
  calculatePolicyChanges,
  collectionConfigToUpdateBody,
} from '../../services/collectionConfigService';
import {
  addPolicy,
  type PolicyConfigOperations,
} from '../../services/policyService';
import type { CollectionConfig } from '../../../public/freelog.collection';
import type { ResourceDetailResponse } from '../../api/types';

/**
 * 执行 collection policy add 命令
 */
export async function executeCollectionPolicyAdd(options: CommandOptions = {}): Promise<void> {
  requireAuth();
  await confirmAuth(options.skipConfirm);

  const configOps: PolicyConfigOperations<CollectionConfig> = {
    loadConfig: loadCollectionConfig,
    saveConfig: saveCollectionConfig,
    calculatePolicyChanges: (localPolicies, remotePolicies) => {
      return calculatePolicyChanges(localPolicies as any, remotePolicies);
    },
    configToUpdateBody: (config, policyChanges) => {
      return collectionConfigToUpdateBody(config, policyChanges);
    },
    updatePolicyIdsFromResponse: (config, response: ResourceDetailResponse) => {
      if (response && response.policies && Array.isArray(response.policies)) {
        config.policies = config.policies?.map(localPolicy => {
          const matchingRemotePolicy = response.policies?.find((rp: any) => rp.policyName === localPolicy.policyName);
          if (matchingRemotePolicy && matchingRemotePolicy.policyId) {
            return { ...localPolicy, policyId: matchingRemotePolicy.policyId };
          }
          return localPolicy;
        }) || [];
      }
      return config;
    },
    getResourceId: (config) => config.resourceId,
  };

  await addPolicy(options, configOps, 'collection');
}
