import { CliError } from '../core/errors.js';

const INVALID_RESOURCE_NAME_CHARS =
  /(\\|\/|:|\*|\?|"|<|>|\||\s|@|\$|#|([\p{Emoji_Presentation}\u200D]+(?:\p{Emoji}\uFE0F)?|(?:\p{Emoji}\uFE0F)))+/gu;

/** Match Console Step1's resourceNameOptimized() before Resource.create. */
export function normalizeCreateName(value: string): string {
  const raw = value.trim();
  if (raw.includes('/')) {
    throw new CliError('创建时 --name 只能是短授权标识，不能包含 username/', {
      code: 4,
      hint: '例如传 --name my-theme；平台会按当前登录账号创建 username/my-theme',
    });
  }

  const name = raw.replace(INVALID_RESOURCE_NAME_CHARS, '_');
  if (!name) {
    throw new CliError('授权标识不能为空', { code: 4 });
  }
  if (name.length > 60) {
    throw new CliError('授权标识长度不能超过 60', { code: 4 });
  }
  return name;
}

export function requireAuthUsername(username?: string): string {
  const value = username?.trim();
  if (!value) {
    throw new CliError('登录信息缺少 username，无法创建资源', {
      code: 2,
      hint: 'freelog-cli login 重新登录后重试',
    });
  }
  return value;
}

export function toFullResourceName(username: string, name: string): string {
  return `${username}/${name}`;
}

/** 平台标准 RT* 类型 create 时勿传 manifest 展示名，否则叶子节点会被拒。 */
export function resolveCreateApiResourceTypeName(
  typeCode: string,
  opts?: { explicit?: string; manifest?: string },
): string | undefined {
  if (opts?.explicit !== undefined && opts.explicit !== '') {
    return opts.explicit;
  }
  if (/^RT\d/.test(typeCode.trim())) {
    return undefined;
  }
  return opts?.manifest;
}
