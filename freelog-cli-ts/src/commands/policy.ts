/**
 * policy add 命令
 * 为资源添加策略
 */

import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';
import {
  loadResourceConfig,
  saveResourceConfig,
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
} from '../services/resourceConfigService';
import {
  addPolicy,
  type PolicyConfigOperations,
} from '../services/policyService';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { ResourceDetailResponse } from '../api/types';

/**
 * 执行 policy add 命令
 */
export async function executePolicyAdd(options: CommandOptions = {}): Promise<void> {
  requireAuth();
  await confirmAuth(options.skipConfirm);

  const configOps: PolicyConfigOperations<ResourceConfig> = {
    loadConfig: loadResourceConfig,
    saveConfig: saveResourceConfig,
    calculatePolicyChanges: (localPolicies, remotePolicies) => {
      return calculatePolicyChanges(localPolicies, remotePolicies);
    },
    configToUpdateBody: (config, policyChanges) => {
      return resourceConfigToUpdateBody(config, policyChanges);
    },
    updatePolicyIdsFromResponse: (config, response: ResourceDetailResponse) => {
      if (response && response.policies && Array.isArray(response.policies)) {
        const policyIdMap = new Map(
          response.policies.map((p) => [p.policyName, p.policyId])
        );
        if (config.policies) {
          config.policies = config.policies.map((localPolicy) => {
            const serverPolicyId = policyIdMap.get(localPolicy.policyName);
            if (serverPolicyId && localPolicy.policyId !== serverPolicyId) {
              return { ...localPolicy, policyId: serverPolicyId };
            }
            return localPolicy;
          });
        }
      }
      return config;
    },
    getResourceId: (config) => config.resourceId,
  };

  await addPolicy(options, configOps, 'resource');
}
