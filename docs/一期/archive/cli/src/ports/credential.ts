/**
 * 系统凭据库端口。value 只能是秘密 JSON；工程文件只保存对它的引用。
 * 保持同步是因为 tools-lib 的认证回调是同步调用点。
 */
export interface CredentialStore {
  get(credentialKey: string): string | undefined;
  set(credentialKey: string, value: string): void;
  delete(credentialKey: string): boolean;
}
