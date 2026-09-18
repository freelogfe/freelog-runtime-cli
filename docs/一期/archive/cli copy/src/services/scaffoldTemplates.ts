export const POLICY_TEMPLATE_RESOURCE = 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n';

export const POLICY_TEMPLATE_COLLECTION = '\nFOR PUBLIC\n\nInitial:\n\tterminate\n';

export const POLICY_FREE_JSON_RESOURCE = {
  policyName: '免费',
  policyText: POLICY_TEMPLATE_RESOURCE,
  status: 1 as const,
};

export const POLICY_FREE_JSON_COLLECTION = {
  policyName: '免费',
  policyText: POLICY_TEMPLATE_COLLECTION.trim(),
  status: 1 as const,
};

export const AUTH_MAP_TEMPLATE_YAML = `# auth-map.yaml — 依赖免费策略签约（不含支付）
# 用法: freelog-cli dep auth --policy-map auth-map.yaml --yes
contracts:
  - resourceId: "<dependency-resource-id>"
    policyIds:
      - "<policy-id>"
`;

export function policyTemplateText(collection: boolean): string {
  return collection ? POLICY_TEMPLATE_COLLECTION : POLICY_TEMPLATE_RESOURCE;
}
