/**
 * 文件系统 Mock 辅助工具
 */

import { vol } from 'memfs';
import path from 'path';

/**
 * Mock 文件系统
 */
export class FsMocker {
  /**
   * 创建 Mock 文件系统
   */
  setup(files: Record<string, string>) {
    vol.fromJSON(files, '/test');
  }

  /**
   * 清理 Mock 文件系统
   */
  cleanup() {
    vol.reset();
  }

  /**
   * 创建配置文件
   */
  createConfig(configPath: string, config: any) {
    const content = typeof config === 'string' 
      ? config 
      : JSON.stringify(config, null, 2);
    
    vol.mkdirpSync(path.dirname(configPath));
    vol.writeFileSync(configPath, content);
  }

  /**
   * 创建认证文件
   */
  createAuthFile(authPath: string, auth: any) {
    vol.mkdirpSync(path.dirname(authPath));
    vol.writeFileSync(authPath, JSON.stringify(auth, null, 2));
  }

  /**
   * 读取文件
   */
  readFile(filePath: string): string {
    return vol.readFileSync(filePath, 'utf-8') as string;
  }

  /**
   * 检查文件是否存在
   */
  exists(filePath: string): boolean {
    return vol.existsSync(filePath);
  }

  /**
   * 获取文件列表
   */
  listFiles(dirPath: string): string[] {
    return vol.readdirSync(dirPath) as string[];
  }
}

/**
 * 创建 FS Mocker
 */
export function createFsMocker(): FsMocker {
  return new FsMocker();
}

/**
 * Mock fs 模块
 */
export function mockFsModule() {
  jest.mock('fs', () => require('memfs').fs);
  jest.mock('fs-extra', () => {
    const memfs = require('memfs');
    return {
      ...memfs.fs,
      ensureDir: jest.fn(async (dir: string) => {
        memfs.vol.mkdirpSync(dir);
      }),
      ensureDirSync: jest.fn((dir: string) => {
        memfs.vol.mkdirpSync(dir);
      }),
      writeJson: jest.fn(async (file: string, data: any) => {
        memfs.vol.writeFileSync(file, JSON.stringify(data, null, 2));
      }),
      writeJsonSync: jest.fn((file: string, data: any) => {
        memfs.vol.writeFileSync(file, JSON.stringify(data, null, 2));
      }),
      readJson: jest.fn(async (file: string) => {
        const content = memfs.vol.readFileSync(file, 'utf-8');
        return JSON.parse(content as string);
      }),
      readJsonSync: jest.fn((file: string) => {
        const content = memfs.vol.readFileSync(file, 'utf-8');
        return JSON.parse(content as string);
      }),
    };
  });
}

/**
 * 恢复 fs 模块
 */
export function restoreFsModule() {
  jest.unmock('fs');
  jest.unmock('fs-extra');
}

