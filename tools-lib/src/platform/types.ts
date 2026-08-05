export type EnvType = 'prod' | 'dev' | 'test';
export type LanguageKeyType = 'zh_CN' | 'en_US';

export interface AuthErrorPayload {
  kind: 'unauthorized' | 'frozen';
  result: any;
}

export interface ApiErrorPayload {
  errCode?: number;
  result: any;
}

export interface PlatformAdapter {
  getEnv(): EnvType;
  getHostname?(): string;
  getCurrentHref?(): string;
  withCredentials: boolean;
  getAuthorization?(): string | undefined | Promise<string | undefined>;
  getHeaders?(): Record<string, string | undefined> | undefined | Promise<Record<string, string | undefined> | undefined>;
  onAuthError?(payload: AuthErrorPayload): void | Promise<void>;
  onApiError?(payload: ApiErrorPayload): void | Promise<void>;
  getUserId?(): number;
  getLocale?(): LanguageKeyType | undefined;
  setLocale?(lng: LanguageKeyType): void;
  getI18nCache?(): string | null;
  setI18nCache?(json: string): void;
  useProdI18nBundle?(): boolean;
  openUrl?(url: string): void;
  sha1?(input: Blob | ArrayBuffer | ArrayBufferView): Promise<string>;
  createFormData?(params: Record<string, unknown>): FormData;
}
