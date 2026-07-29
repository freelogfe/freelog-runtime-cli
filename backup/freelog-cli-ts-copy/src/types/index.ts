// 全局类型定义
export interface AuthInfo {
  token: string;
  authorization?: string;
  userId: string;
  username: string;
  scope: 'global' | 'workspace';
  encrypted?: boolean;
}

export interface FreelogConfig {
  name?: string;
  version?: string;
  workId?: string;
  intro?: string;
  dependencies?: any[];
  [key: string]: any;
}

export interface CommandOptions {
  [key: string]: any;
}

export type Environment = 'development' | 'production';

