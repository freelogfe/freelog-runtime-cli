import FUtil from '../utils';
// import {CommonReturn} from "./tools";

// 根据编号取资源类型
interface GetInfoByCodeType {
  code: string;
}

export function getInfoByCode({...params}: GetInfoByCodeType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/getInfoByCode`,
    params: params,
  });
}

// 根据编号取资源类型
interface GetInfoByCodeOrNameType {
  code?: string;
  name?: string;
}

export function getInfoByCodeOrName({...params}: GetInfoByCodeOrNameType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/getInfoByCodeOrName`,
    params: params,
  });
}
