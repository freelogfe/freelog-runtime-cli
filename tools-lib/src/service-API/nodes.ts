import FUtil from '../utils';

// 创建节点
export interface CreateParamsType {
  nodeName: string;
  nodeDomain: string;
  nodeTitle: string;
}

export function create(params: CreateParamsType) {
  // return FUtil.Axios.post('/v2/nodes', params);
  return FUtil.Request({
    method: 'POST',
    url: `/v2/nodes`,
    data: params,
  });
}

// 查看节点详情
interface NodeDetailParamsType1 {
  nodeId: number;
}

interface NodeDetailParamsType2 {
  nodeName?: string;
  nodeDomain?: string;
}

export function details(params: NodeDetailParamsType1 | NodeDetailParamsType2) {
  if ((params as NodeDetailParamsType1).nodeId) {
    // return FUtil.Axios.get(`/v2/nodes/${(params as NodeDetailParamsType1).nodeId}`);
    return FUtil.Request({
      method: 'GET',
      url: `/v2/nodes/${(params as NodeDetailParamsType1).nodeId}`,
      // params: params,
    });
  }
  // return FUtil.Axios.get(`/v2/nodes/detail`, {
  //   params,
  // });
  return FUtil.Request({
    method: 'GET',
    url: `/v2/nodes/detail`,
    params: params,
  });
}

// 查看节点列表
interface NodesParamsType {
  skip?: number;
  limit?: number;
  status?: 0 | 1 | 2; // 0:正常 1:未审核 2:冻结
  projection?: string;
  nodeType?: 0 | 1;
}

export function nodes(params: NodesParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/nodes`,
    params: params,
  });
}

// 示例节点
interface SearchForClientParamsType {
  skip?: number;
  limit?: number;
  status?: 0 | 1 | 2; // 0:正常 1:未审核 2:冻结
  projection?: string;
  nodeType?: 0 | 1;
}

export function searchForClient(params: SearchForClientParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/nodes/searchForClient`,
    params: params,
  });
}

// 设置节点信息（除 nodeId 外均为可选，仅传需要修改的字段）
interface SetNodeInfoParamsType {
  nodeId: number;
  nodeLogo?: string;
  nodeTitle?: string;
  nodeShortDescription?: string;
  status?: 1 | 2 | 8; // 可见性 1：公开 2：私密 8：暂停
  nodeSuspendInfo?: string;
  exhibitMatchTags?: string[]; // 展品筛选标签
  coverImage?: string; // 节点封面
}

export function setNodeInfo(params: SetNodeInfoParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/nodes/setNodeInfo`,
    data: params,
  });
}

// 删除节点
interface DeleteNodeParamsType {
  nodeId: number;
}

export function deleteNode({nodeId}: DeleteNodeParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/nodes/${nodeId}`,
    // params: params,
  });
}

