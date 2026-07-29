/**
 * 资源名称格式化工具
 */

import { getCurrentAuth } from '../core/auth';
import { getCurrentUser } from '../api/user';

/**
 * 格式化资源名称或ID
 * 如果资源名称不包含 `/`，则添加当前用户名作为前缀
 * 格式: 用户名/资源名称
 * 
 * @param resourceIdOrName 资源ID或名称
 * @param username 可选的用户名，如果不提供则从认证信息或API获取
 * @returns 格式化后的资源标识符
 */
export async function formatResourceIdOrName(
  resourceIdOrName: string,
  username?: string
): Promise<string> {
  // 如果已经包含 `/`，说明已经是完整格式，直接返回
  if (resourceIdOrName.includes('/')) {
    return resourceIdOrName;
  }

  // 如果提供了用户名，直接使用
  if (username) {
    return `${username}/${resourceIdOrName}`;
  }

  // 尝试从认证信息获取用户名
  const auth = getCurrentAuth();
  if (auth?.username) {
    return `${auth.username}/${resourceIdOrName}`;
  }

  // 如果认证信息中没有用户名，尝试从API获取
  try {
    const userInfo = await getCurrentUser();
    if (userInfo?.username) {
      return `${userInfo.username}/${resourceIdOrName}`;
    }
  } catch (err) {
    // 如果获取用户信息失败，继续使用原始值
    // 这种情况下，如果资源名称不包含 `/`，API可能会失败，但这是预期的行为
  }

  // 如果无法获取用户名，返回原始值
  // 这种情况下，如果资源名称不包含 `/`，API可能会失败
  return resourceIdOrName;
}

/**
 * 同步版本的格式化函数（使用认证信息中的用户名）
 * 如果认证信息中没有用户名，则返回原始值
 * 
 * @param resourceIdOrName 资源ID或名称
 * @returns 格式化后的资源标识符
 */
export function formatResourceIdOrNameSync(resourceIdOrName: string): string {
  // 如果已经包含 `/`，说明已经是完整格式（username/resourceName），直接返回
  if (resourceIdOrName.includes('/')) {
    return resourceIdOrName;
  }

  // 如果是资源ID（24位十六进制字符串），直接返回，不添加用户名前缀
  // 资源ID格式：693f7ec6bb2473002f196a55（24个字符的十六进制字符串）
  if (/^[0-9a-fA-F]{24}$/.test(resourceIdOrName)) {
    return resourceIdOrName;
  }

  // 尝试从认证信息获取用户名
  const auth = getCurrentAuth();
  if (auth?.username) {
    return `${auth.username}/${resourceIdOrName}`;
  }

  // 如果无法获取用户名，返回原始值
  return resourceIdOrName;
}

