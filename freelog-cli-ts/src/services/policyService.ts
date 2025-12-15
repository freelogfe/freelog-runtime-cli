/**
 * 策略管理服务
 * 统一处理单独资源和批量资源的策略管理
 */

import type { ResourceConfig } from '../../public/freelog.resource';
import type { PolicyInfo } from '../api/types';
import type { UpdateResourceBody } from '../api/resource';
import { calculatePolicyChanges, resourceConfigToUpdateBody } from './resourceConfigService';
import { policyTemplates, policyTranslation, type PolicyTemplateInfo, type DisplayItem } from '../api/policy';

/**
 * 策略变更信息
 */
export interface PolicyChangeInfo {
  addPolicies: Array<{ policyId: string; policyName: string; status: number }>;
  updatePolicies: Array<{ policyId: string; policyName: string; status: number }>;
  removePolicies: Array<{ policyId: string; policyName: string }>;
}

/**
 * 计算策略变更
 * @param localPolicies 本地配置的策略列表
 * @param remotePolicies 服务器上的策略列表
 * @returns 策略变更信息
 */
export function getPolicyChanges(
  localPolicies: ResourceConfig['policies'] = [],
  remotePolicies: PolicyInfo[] = []
): PolicyChangeInfo {
  return calculatePolicyChanges(
    localPolicies,
    remotePolicies.map(p => ({
      policyId: p.policyId || '',
      policyName: p.policyName || '',
      status: p.status || 0,
    }))
  );
}

/**
 * 构建策略更新请求体
 * @param resourceConfig 资源配置
 * @param policyChanges 策略变更信息
 * @returns 更新请求体
 */
export function buildPolicyUpdateBody(
  resourceConfig: ResourceConfig,
  policyChanges: PolicyChangeInfo
): UpdateResourceBody {
  return resourceConfigToUpdateBody(resourceConfig, policyChanges);
}

/**
 * 更新单个策略的状态
 * @param policies 策略列表
 * @param policyId 策略ID
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function updatePolicyStatus(
  policies: PolicyInfo[],
  policyId: string,
  status: number
): PolicyInfo[] {
  return policies.map(p => {
    if (p.policyId === policyId) {
      return { ...p, status };
    }
    return p;
  });
}

/**
 * 批量更新策略状态
 * @param policies 策略列表
 * @param policyIds 要更新的策略ID列表
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function batchUpdatePolicyStatus(
  policies: PolicyInfo[],
  policyIds: string[],
  status: number
): PolicyInfo[] {
  return policies.map(p => {
    if (p.policyId && policyIds.includes(p.policyId)) {
      return { ...p, status };
    }
    return p;
  });
}

/**
 * 更新所有策略状态
 * @param policies 策略列表
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function updateAllPolicyStatus(
  policies: PolicyInfo[],
  status: number
): PolicyInfo[] {
  return policies.map(p => ({ ...p, status }));
}

/**
 * 获取策略模板信息列表
 * 从 API 获取策略模板，并转换为包含 displayData 的格式
 */
export async function getPolicyTemplateInfos(): Promise<PolicyTemplateInfo[]> {
  const templates = await policyTemplates();
  
  const templateInfos: PolicyTemplateInfo[] = [];
  
  for (const template of templates) {
    try {
      // 翻译策略模板以获取 displayData
      const policyCodeEncoded = template.template.replace(/(\t|\r)/g, ' ');
      const policyCodeBase64 = Buffer.from(policyCodeEncoded, 'utf-8').toString('base64');
      
      const translationResult = await policyTranslation({
        contract: policyCodeBase64,
      });
      
      // translationResult 是一个字符串，需要解析为 DisplayItem[]
      // 根据 API 文档，翻译结果应该包含 displayData
      // 这里假设 translationResult 是一个 JSON 字符串，包含 displayData 字段
      let displayData: DisplayItem[] = [];
      let translation = '';
      
      try {
        // 尝试解析为 JSON
        const parsed = typeof translationResult === 'string' 
          ? JSON.parse(translationResult) 
          : translationResult;
        
        if (parsed && parsed.displayData && Array.isArray(parsed.displayData)) {
          displayData = parsed.displayData;
          translation = parsed.translation || parsed.content || translationResult;
        } else {
          // 如果不是 JSON，则作为纯文本处理
          translation = typeof translationResult === 'string' 
            ? translationResult 
            : JSON.stringify(translationResult);
        }
      } catch {
        // 解析失败，作为纯文本处理
        translation = typeof translationResult === 'string' 
          ? translationResult 
          : JSON.stringify(translationResult);
      }
      
      // 如果没有 displayData，尝试从 reportUiTemplate 构建
      if (displayData.length === 0 && template.reportUiTemplate) {
        displayData = template.reportUiTemplate.map((uiTemplate, index) => {
          const item: DisplayItem = {
            id: uiTemplate.id || `param_${index}`,
            type: uiTemplate.uiSectionType === 'select' ? 'select' : 'number',
          };
          
          if (uiTemplate.uiSectionType === 'select') {
            item.select = {
              value: '',
              options: uiTemplate.selectOptions || [],
            };
          } else {
            item.number = {
              value: typeof uiTemplate.uiSectionDefaultValue === 'number' 
                ? uiTemplate.uiSectionDefaultValue 
                : 0,
            };
          }
          
          return item;
        });
      }
      
      templateInfos.push({
        id: template._id,
        title: template.title,
        code: template.template,
        translation: translation,
        displayData: displayData,
      });
    } catch (err) {
      // 如果翻译失败，仍然添加模板，但 displayData 为空
      console.warn(`策略模板 ${template.title} 翻译失败:`, err);
      templateInfos.push({
        id: template._id,
        title: template.title,
        code: template.template,
        translation: template.reportTranslate || '',
        displayData: [],
      });
    }
  }
  
  return templateInfos;
}
