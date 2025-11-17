/**
 * Freelog 资源配置文件
 * @type {import('../freelog.resource').ResourceConfig}
 */
const config = {
  resourceId: '',
  resourceName: '',
  resourceType: [],
  resourceTitle: '',
  intro: '',
  coverImages: [],
  tags: [],
  resourceTypeCode: '',
  status: 0, // 0:待发行 1:上架 2:冻结 4:下架
  policies: [], // 资源策略信息
};

export default config;

