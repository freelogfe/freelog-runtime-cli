// import * as CryptoJS from 'crypto-js';
import {completeUrlByDomain} from './domain';
import { getPlatform } from '../platform/runtime';

/**
 * 根据二进制内容获取 SHA1 Hash 字符串
 * @param file 二进制内容
 * @return {Promise<string>}
 */
export async function getSHA1Hash(file: Blob | ArrayBuffer | ArrayBufferView): Promise<string> {
  const sha1 = getPlatform().sha1;
  if (!sha1) {
    throw new Error('[@freelog/tools-lib] Current platform does not support SHA1.');
  }
  return sha1(file);
}

/**
 * 生成随机码
 */
export function generateRandomCode(strLen: number = 5): string {
  const allStr: string = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  const newStrArr: string[] = [];
  for (let i = 0; i < strLen; i++) {
    newStrArr.push(allStr[Math.floor(Math.random() * 61)]);
  }
  return newStrArr.join('');
}

/**
 * 通过读取 cookies 获取用户 ID
 */
export function getUserIDByCookies(): number {
  return getPlatform().getUserId?.() ?? -1;
}

export const getUserId = getUserIDByCookies;


/**
 * 将服务端的合约状态转换成前端需要的状态
 */
interface TransformServerAPIContractStateParams {
  status: 0 | 1 | 2; // 合同综合状态: 0:正常 1:已终止(不接受任何事件,也不给授权,事实上无效的合约) 2:异常
  authStatus: 1 | 2 | 128 | number; // 合同授权状态 1:正式授权 2:测试授权 128:未获得授权
}

export function transformServerAPIContractState({
                                                  status,
                                                  authStatus,
                                                }: TransformServerAPIContractStateParams): 'active' | 'testActive' | 'inactive' | 'terminal' | 'exception' {
  if (status === 0) {
    if (authStatus === 1 || authStatus === 3) {
      return 'active';
    }
    if (authStatus === 2) {
      return 'testActive';
    }
    if (authStatus === 128) {
      return 'inactive';
    }
  }

  if (status === 1) {
    return 'terminal';
  }
  return 'exception';
}

/**
 * 暂时休眠
 * @param ms 休眠时常(毫秒)
 */
export function promiseSleep(ms: number = 300): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

/**
 * 获取用户头像URL
 * @param userID
 */
export function getAvatarUrl(userID: number = 0): string {
  // return `${completeUrlByDomain('image')}/avatar/${userID || getUserIDByCookies()}?t=${Date.now()}`;
  return `${completeUrlByDomain('image')}/avatar/${userID || getUserIDByCookies()}?t=${Date.now()}`;
}
