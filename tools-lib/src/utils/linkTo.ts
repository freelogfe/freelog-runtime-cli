import * as querystring from 'querystring';
import { getPlatform } from '../platform/runtime';

type TReturnType = string;

/************** www Start ******************************************************/
// 首页
interface HomeParamsType {}

export function home({}: HomeParamsType = {}) {
  return `/home`;
}

// 活动列表
interface ActivitiesParamsType {}

export function activities({}: ActivitiesParamsType = {}) {
  return `/activities`;
}

// 活动详情
interface ActivitiesParamsType {
  activityID: string;
}

export function activity({ activityID }: ActivitiesParamsType) {
  return `/activity/${activityID}`;
}

interface WXShareParamsType {
  link: string;
  title: string;
  desc: string;
  imgUrl: string;
}

export function wxShare({ link, title, desc, imgUrl }: WXShareParamsType) {
  return `/wx-share/index.html#title=${title}&desc=${desc}&link=${link}&imgUrl=${imgUrl}`;
}

/************** www End ******************************************************/

/************** console Start ******************************************************/
// dashboard
interface DashboardParamsType {}

export function dashboard({}: DashboardParamsType = {}) {
  return `/dashboard`;
}

// 资源市场
interface MarketParamsType {
  // nodeID: number;
  query?: string;
}

export function market({ ...params }: MarketParamsType = {}): TReturnType {
  return `/market${handleQuery(params)}`;
}

// 示例节点
interface ExampleNodesParamsType {}

export function exampleNodes({}: ExampleNodesParamsType = {}): TReturnType {
  return `/examples`;
}

// 资源详情
interface ResourceDetailsParamsType {
  resourceID: string;
  version?: string;
}

export function resourceDetails({
  resourceID,
  ...params
}: ResourceDetailsParamsType): TReturnType {
  return `/resource/details/${resourceID}${handleQuery(params)}`;
}

// 集合详情
interface CollectionDetailsParamsType {
  collectionID: string;
  // version?: string;
}

export function collectionDetails({
  collectionID,
}: CollectionDetailsParamsType): TReturnType {
  return `/resource/collectionDetails/${collectionID}`;
}

// 资源创建入口
interface ResourceCreatorParamsType {}

export function resourceCreatorEntry({}: ResourceCreatorParamsType = {}): TReturnType {
  return `/resource/creatorEntry`;
}

// 资源创建
interface ResourceCreatorParamsType {}

export function resourceCreator({}: ResourceCreatorParamsType = {}): TReturnType {
  return `/resource/creator`;
}

// 资源批量创建
interface ResourceCreatorParamsType {}

export function resourceCreatorBatch({}: ResourceCreatorParamsType = {}): TReturnType {
  return `/resource/creatorBatch`;
}

// 集合创建
interface CollectionCreatorParamsType {}

export function collectionCreator({}: CollectionCreatorParamsType = {}): TReturnType {
  return `/resource/collectionCreator`;
}

// 我的资源
interface MyResourcesParamsType {}

export function myResources({}: MyResourcesParamsType = {}): TReturnType {
  return `/resource/list`;
}

// 我的集合
interface MyCollectionsParamsType {}

export function myCollections({}: MyCollectionsParamsType = {}): TReturnType {
  return `/resource/collection`;
}

// 我的收藏
interface MyCollectsParamsType {}

export function myCollects({}: MyCollectsParamsType = {}): TReturnType {
  return `/resource/collect`;
}

// 我的资源收入
interface MyResourceIncomeParamsType {}

export function myResourceIncome({}: MyResourceIncomeParamsType = {}): TReturnType {
  return `/resource/income`;
}

// 我的资源交易
interface MyResourceTransactionParamsType {}

export function myResourceTransaction({}: MyResourceTransactionParamsType = {}): TReturnType {
  return `/resource/transaction`;
}

// 资源版本信息
interface ResourceVersionInfoParamsType {
  resourceID: string;
  version?: string;
}

export function resourceVersionInfo({
  resourceID,
  version = '',
}: ResourceVersionInfoParamsType): TReturnType {
  return `/resource/sidebar/versionInfo/${resourceID}${handleQuery({
    version,
  })}`;
}

// 资源信息
interface ResourceInfoParamsType {
  resourceID: string;
}

export function resourceInfo({
  resourceID,
}: ResourceInfoParamsType): TReturnType {
  return `/resource/sidebar/info/${resourceID}`;
}

// 资源授权策略
interface ResourcePolicyParamsType {
  resourceID: string;
}

export function resourcePolicy({
  resourceID,
}: ResourcePolicyParamsType): TReturnType {
  return `/resource/sidebar/policy/${resourceID}`;
}

// 资源授权合约
interface ResourceContractParamsType {
  resourceID: string;
}

export function resourceContract({
  resourceID,
}: ResourceContractParamsType): TReturnType {
  return `/resource/sidebar/contract/${resourceID}`;
}

// 资源被授权管理
interface ResourceDependencyParamsType {
  resourceID: string;
}

export function resourceDependency({
  resourceID,
}: ResourceDependencyParamsType): TReturnType {
  return `/resource/sidebar/dependency/${resourceID}`;
}

// 资源版本创建
interface ResourceVersionCreatorParamsType {
  resourceID: string;
}

export function resourceVersionCreator({
  resourceID,
}: ResourceVersionCreatorParamsType): TReturnType {
  return `/resource/versionCreator/${resourceID}`;
}

// 集合版本信息
interface CollectionVersionInfoParamsType {
  collectionID: string;
  // version?: string;
}

export function collectionVersionInfo({
  collectionID,
}: CollectionVersionInfoParamsType): TReturnType {
  return `/resource/collectionSidebar/versionInfo/${collectionID}`;
}

// 集合信息
interface CollectionInfoParamsType {
  collectionID: string;
}

export function collectionInfo({
  collectionID,
}: CollectionInfoParamsType): TReturnType {
  return `/resource/collectionSidebar/info/${collectionID}`;
}

// 集合授权策略
interface CollectionPolicyParamsType {
  collectionID: string;
}

export function collectionPolicy({
  collectionID,
}: CollectionPolicyParamsType): TReturnType {
  return `/resource/collectionSidebar/policy/${collectionID}`;
}

// 集合授权合约
interface CollectionContractParamsType {
  collectionID: string;
}

export function collectionContract({
  collectionID,
}: CollectionContractParamsType): TReturnType {
  return `/resource/collectionSidebar/contract/${collectionID}`;
}

// 集合被授权管理
interface CollectionDependencyParamsType {
  collectionID: string;
}

export function collectionDependency({
  collectionID,
}: CollectionDependencyParamsType): TReturnType {
  return `/resource/collectionSidebar/dependency/${collectionID}`;
}

// 节点创建
interface NodeCreatorParamsType {
  // nodeID: number;
}

export function nodeCreator({}: NodeCreatorParamsType = {}): TReturnType {
  return `/node/creator`;
}

// 节点管理
interface NodeManagementParamsType {
  nodeID: number;
  showPage?:
    | 'exhibit'
    | 'theme'
    | 'contract'
    | 'setting'
    | 'income'
    | 'transaction';
}

export function nodeManagement({
  nodeID,
  showPage = 'exhibit',
  ...params
}: NodeManagementParamsType): TReturnType {
  return `/node/formal/${nodeID}${handleQuery({ showPage, ...params })}`;
}

// 展品管理
interface ExhibitManagementParamsType {
  exhibitID: string;
  openAuthDrawer?: boolean;
  showMoreSetting?: boolean;
}

export function exhibitManagement({
  exhibitID,
  ...params
}: ExhibitManagementParamsType): TReturnType {
  return `/node/exhibit/formal/${exhibitID}${handleQuery({
    ...params,
  })}`;
}

// 集合展品管理
interface CollectionExhibitManagementParamsType {
  exhibitID: string;
  openAuthDrawer?: boolean;
}

export function collectionExhibitManagement({
  exhibitID,
  openAuthDrawer,
}: CollectionExhibitManagementParamsType): TReturnType {
  return `/node/collectionExhibit/formal/${exhibitID}${handleQuery({
    openAuthDrawer,
  })}`;
}

// 集合展品创建
interface CollectionExhibitCreatorParamsType {
  nodeID: number;
}

export function collectionExhibitCreator({
  nodeID,
}: CollectionExhibitCreatorParamsType): TReturnType {
  return `/node/collectionExhibitCreator/${nodeID}`;
}

// 创建的集合展品管理
interface CreatedCollectionExhibitManagementParamsType {
  exhibitID: string;
}

export function createdCollectionExhibitManagement({
  exhibitID,
}: CreatedCollectionExhibitManagementParamsType): TReturnType {
  return `/node/createdCollectionExhibit/formal/${exhibitID}`;
}

// 测试节点管理
interface InformNodeManagementParamsType {
  nodeID: number;
  showPage?: 'exhibit' | 'theme' | 'mappingRule';
}

export function informNodeManagement({
  nodeID,
  showPage = 'exhibit',
  ...params
}: InformNodeManagementParamsType): TReturnType {
  return `/node/informal/${nodeID}${handleQuery({ showPage, ...params })}`;
}

// 测试展品管理
interface InformExhibitManagementParamsType {
  exhibitID: string;
  openAuthDrawer?: boolean;
}

export function informExhibitManagement({
  exhibitID,
  openAuthDrawer = undefined,
}: InformExhibitManagementParamsType): TReturnType {
  return `/node/exhibit/informal/${exhibitID}${handleQuery({
    openAuthDrawer,
  })}`;
}

// 存储空间
interface StorageSpaceParamsType {
  bucketName?: string;
  createBucket?: boolean;
}

export function storageSpace({
  ...params
}: StorageSpaceParamsType = {}): TReturnType {
  return `/storage${handleQuery(params)}`;
}

// 对象详情
interface ObjectDetailsParamsType {
  bucketName: string;
  objectID: string;
}

export function objectDetails({
  ...params
}: ObjectDetailsParamsType): TReturnType {
  return `/storage${handleQuery(params)}`;
}

// 集合创建成功
interface CollectionCreateSuccessParamsType {
  collectionID: string;
}

export function collectionCreateSuccess({
  collectionID,
}: CollectionCreateSuccessParamsType) {
  return `/result/collection/create/success/${collectionID}`;
}

// 资源创建成功
interface ResourceCreateSuccessParamsType {
  resourceID: string;
}

export function resourceCreateSuccess({
  resourceID,
}: ResourceCreateSuccessParamsType) {
  return `/result/resource/create/success/${resourceID}`;
}

// 资源版本创建成功
interface ResourceVersionCreateSuccessParamsType {
  resourceID: string;
  version: string;
}

export function resourceVersionCreateSuccess({
  resourceID,
  version,
}: ResourceVersionCreateSuccessParamsType) {
  return `/result/resource/version/create/success/${resourceID}/${version}`;
}

// 资源版本正在创建
interface ResourceVersionCreateReleaseParamsType {
  resourceID: string;
  version: string;
}

export function resourceVersionCreateRelease({
  resourceID,
  version,
}: ResourceVersionCreateReleaseParamsType) {
  return `/result/resource/version/create/release/${resourceID}/${version}`;
}

// 节点创建成功
interface NodeCreateSuccessParamsType {
  nodeID: number;
}

export function nodeCreateSuccess({ nodeID }: NodeCreateSuccessParamsType) {
  return `/result/node/create/success/${nodeID}`;
}

// 内测资格申请
interface InvitationParamsType {
  goTo?: string;
  invitationCode?: string;
}

export function invitation({ goTo, ...params }: InvitationParamsType = {}) {
  // console.log(params.goTo, 'goTo9iowjefklsdj;flksdjflk')
  return `/invitation${handleQuery({
    ...params,
    returnUrl: goTo ? encodeURIComponent(goTo) : undefined,
  })}`;
}

// 403
interface Exception403ParamsType {
  from?: string;
}

export function exception403({ ...params }: Exception403ParamsType = {}) {
  let fromUrl: string = params.from || '';
  if (!fromUrl) {
    const href = getPlatform().getCurrentHref?.() || '';
    fromUrl = href.replace(/^https?:\/\/[^/]+/i, '');
  }

  return `/exception/403${handleQuery({
    from: fromUrl,
  })}`;
}

// unableToAccess
interface ExceptionUnableToAccessParamsType {
  from?: string;
}

export function exceptionUnableToAccess({
  ...params
}: ExceptionUnableToAccessParamsType = {}) {
  let fromUrl: string = params.from || '';
  if (!fromUrl) {
    const href = getPlatform().getCurrentHref?.() || '';
    fromUrl = href.replace(/^https?:\/\/[^/]+/i, '');
  }

  return `/exception/unableToAccess${handleQuery({
    from: fromUrl,
  })}`;
}

// /exception/common?tipText=1234
// 通用异常
interface ExceptionCommonParamsType {
  tipText?: string;
  btnText?: string;
}

export function exceptionCommon({ ...params }: ExceptionCommonParamsType = {}) {
  return `/exception/common${handleQuery({
    ...params,
  })}`;
}

// 节点封禁
interface NodeFreezeParamsType {
  nodeID: number;
}

export function nodeFreeze({ nodeID }: NodeFreezeParamsType) {
  return `/result/node/freeze/${nodeID}`;
}

// 节点已删除（页面不存在）
interface NodeDeletedParamsType {
  nodeID: number;
}

export function nodeDeleted({ nodeID }: NodeDeletedParamsType) {
  return `/result/node/deleted/${nodeID}`;
}

// 资源封禁
interface ResourceFreezeParamsType {
  resourceID: string;
}

export function resourceFreeze({ resourceID }: ResourceFreezeParamsType) {
  return `/result/resource/freeze/${resourceID}`;
}

// 站内搜索
interface GlobalSearchParamsType {
  search: string;
}

export function globalSearch({ search }: GlobalSearchParamsType) {
  return `/search${handleQuery({
    search,
  })}`;
}

// 结算信息创建
interface SettlementInfoCreatorParamsType {
  nodeID?: number;
}

export function settlementInfoCreator({ nodeID }: SettlementInfoCreatorParamsType) {
  return `/settlementCreator${handleQuery({ nodeID })}`;
}

// 结算信息详情
interface SettlementInfoParamsType {
  accountID: string;
}

export function settlementInfo({ accountID }: SettlementInfoParamsType) {
  return `/settlementInfo/${accountID}`;
}

// 结算信息编辑
interface SettlementInfoEditorParamsType {
  accountID: string;
}

export function settlementInfoEditor({ accountID }: SettlementInfoEditorParamsType) {
  return `/settlementEditor/${accountID}`;
}

// 结算银行卡编辑
interface SettlementBankCardEditorParamsType {
  accountID: string;
}

export function settlementBankCardEditor({ accountID }: SettlementBankCardEditorParamsType) {
  return `/settlementBankCardEditor/${accountID}`;
}

// 结算银行卡详情
/************** console End ******************************************************/

/************** user Start ******************************************************/
// 登录
interface LoginParamsType {
  goTo?: string;
}

export function login({ goTo }: LoginParamsType = {}) {
  return `/login${handleQuery({
    goTo: goTo ? encodeURIComponent(goTo) : undefined,
  })}`;
}

// 注册
interface LoginParamsType {
  goTo?: string;
  invitationCode?: string;
}

export function logon({ goTo, ...params }: LoginParamsType = {}) {
  return `/logon${handleQuery({
    goTo: goTo ? encodeURIComponent(goTo) : undefined,
    ...params,
  })}`;
}

// 绑定账户
interface LoginParamsType {
  goTo?: string;
  identityId?: string;
  returnUrl?: string;
}

export function bind({ goTo, returnUrl, ...params }: LoginParamsType = {}) {
  return `/bind${handleQuery({
    goTo: goTo ? encodeURIComponent(goTo) : undefined,
    returnUrl: returnUrl ? encodeURIComponent(returnUrl) : undefined,
    ...params,
  })}`;
}

// 找回密码
interface RetrieveUserPasswordParamsType {
  goTo?: string;
}

export function retrieveUserPassword({
  goTo,
}: RetrieveUserPasswordParamsType = {}) {
  return `/retrieve${handleQuery({
    goTo: goTo ? encodeURIComponent(goTo) : undefined,
  })}`;
}

// 找回支付密码
interface RetrievePayPasswordParamsType {
  goTo?: string;
}

export function retrievePayPassword({}: RetrievePayPasswordParamsType = {}) {
  return `/retrievePayPassword`;
}

// 用户冻结
interface UserFreezeParamsType {
  // goTo?: string;
}

export function userFreeze({}: UserFreezeParamsType = {}) {
  return `/freeze`;
}

// 我的钱包
interface WalletParamsType {}

export function wallet({}: WalletParamsType = {}) {
  return `/logged/wallet`;
}

// 活动奖励
interface RewardParamsType {}

export function reward({}: RewardParamsType = {}) {
  return `/logged/reward`;
}

// 我的合约
interface ContractParamsType {
  identityType?: 1 | 2;
  licensorName?: string;
  licenseeName?: string;
}

export function contract({ ...params }: ContractParamsType = {}) {
  return `/logged/contract${handleQuery({
    ...params,
  })}`;
}

// 个人设置
interface SettingParamsType {}

export function setting({}: SettingParamsType = {}) {
  return `/logged/setting`;
}

// 绑定
interface BindingParamsType {}

export function binding({}: BindingParamsType = {}) {
  return `/logged/binding`;
}

// 绑定成功
interface ResultBindingSuccessParamsType {}

export function resultBindingSuccess({}: ResultBindingSuccessParamsType = {}) {
  return `/result/binding`;
}

/************** user End ******************************************************/

function handleQuery(query: object): string {
  const obj: any = {};
  for (const [key, value] of Object.entries(query)) {
    if (key && value) {
      obj[key] = value;
    }
  }
  const result: string = querystring.stringify(obj);
  return result ? '?' + result : '';
}
