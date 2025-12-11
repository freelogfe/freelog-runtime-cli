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
  type PolicyConfig,
  type PolicyConfigOperations,
} from '../services/policyService';
import type { ResourceConfig } from '../../public/freelog.resource';
import { updateResource, getResourceInfo } from '../api/resource';

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
      return calculatePolicyChanges(localPolicies as any, remotePolicies);
    },
    configToUpdateBody: (config, policyChanges) => {
      return resourceConfigToUpdateBody(config, policyChanges);
    },
    updatePolicyIdsFromResponse: (config, response) => {
      if (response.policies) {
        const policyIdMap = new Map<string, string>(
          response.policies.map((p: any) => [p.policyName, p.policyId]).filter(([_, id]: [string, any]) => !!id)
        );
        if (config.policies) {
          for (const localPolicy of config.policies) {
            const serverPolicyId = policyIdMap.get(localPolicy.policyName);
            if (serverPolicyId && localPolicy.policyId !== serverPolicyId) {
              localPolicy.policyId = serverPolicyId;
            }
          }
        }
      }
      return config;
    },
  };

  await addPolicy(options, configOps, 'resource');
}

