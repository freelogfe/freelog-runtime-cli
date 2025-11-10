/**
 * 认证流程集成测试
 */

import path from 'path';
import { vol } from 'memfs';
import nock from 'nock';
import { saveAuth, getAuth, getCurrentAuth, requireAuth, clearAuth } from '../../../src/core/auth';
import { AuthError } from '../../../src/core/errors';
import type { AuthInfo } from '../../../src/types';

// Mock fs-extra
jest.mock('fs-extra', () => {
  const memfs = require('memfs');
  return {
    ...memfs.fs,
    existsSync: (path: string) => memfs.vol.existsSync(path),
    readFileSync: (path: string, encoding?: string) => memfs.vol.readFileSync(path, encoding),
    writeFileSync: (path: string, data: any) => memfs.vol.writeFileSync(path, data),
    readJsonSync: (path: string) => {
      const content = memfs.vol.readFileSync(path, 'utf-8');
      return JSON.parse(content as string);
    },
    writeJsonSync: (path: string, data: any) => {
      memfs.vol.writeFileSync(path, JSON.stringify(data, null, 2));
    },
    ensureDirSync: (dir: string) => {
      memfs.vol.mkdirpSync(dir);
    },
    removeSync: (path: string) => {
      if (memfs.vol.existsSync(path)) {
        memfs.vol.unlinkSync(path);
      }
    },
  };
});

// Mock os.homedir
jest.mock('os', () => ({
  homedir: () => '/home/testuser',
}));

const API_BASE_URL = 'https://api.freelog.com';

describe('Authentication Flow', () => {
  beforeEach(() => {
    vol.reset();
    // 模拟当前工作目录
    process.cwd = jest.fn(() => '/test/project');
    // 清除环境变量
    delete process.env.FREELOG_AUTH_PATH_GLOBAL;
    delete process.env.FREELOG_AUTH_PATH_WORKSPACE;
  });

  afterEach(() => {
    vol.reset();
    nock.cleanAll();
  });

  describe('Complete Login Flow', () => {
    it('should save and retrieve global auth', () => {
      const authInfo: AuthInfo = {
        userId: 50021,
        username: 'testuser',
        email: 'test@example.com',
        token: 'test-token-123',
        authorization: 'Bearer test-token-123',
      };

      // 保存全局认证
      saveAuth(authInfo, true);

      // 验证文件已创建
      const globalAuthPath = '/home/testuser/.freelog/auth.json';
      expect(vol.existsSync(globalAuthPath)).toBe(true);

      // 获取全局认证
      const retrieved = getAuth(true);
      expect(retrieved).toBeDefined();
      expect(retrieved?.userId).toBe(50021);
      expect(retrieved?.username).toBe('testuser');
      expect(retrieved?.token).toBe('test-token-123');
    });

    it('should save and retrieve workspace auth', () => {
      vol.mkdirpSync('/test/project');
      
      const authInfo: AuthInfo = {
        userId: 50022,
        username: 'workspace-user',
        email: 'workspace@example.com',
        token: 'workspace-token-456',
        authorization: 'Bearer workspace-token-456',
      };

      // 保存工作空间认证
      saveAuth(authInfo, false);

      // 验证文件已创建
      const workspaceAuthPath = '/test/project/.freelog/auth.json';
      expect(vol.existsSync(workspaceAuthPath)).toBe(true);

      // 获取工作空间认证
      const retrieved = getAuth(false);
      expect(retrieved).toBeDefined();
      expect(retrieved?.userId).toBe(50022);
      expect(retrieved?.username).toBe('workspace-user');
    });

    it('should prioritize workspace auth over global auth', () => {
      vol.mkdirpSync('/test/project');
      
      const globalAuth: AuthInfo = {
        userId: 50021,
        username: 'global-user',
        email: 'global@example.com',
        token: 'global-token',
        authorization: 'Bearer global-token',
      };

      const workspaceAuth: AuthInfo = {
        userId: 50022,
        username: 'workspace-user',
        email: 'workspace@example.com',
        token: 'workspace-token',
        authorization: 'Bearer workspace-token',
      };

      // 保存两个认证
      saveAuth(globalAuth, true);
      saveAuth(workspaceAuth, false);

      // 获取当前认证（应该返回工作空间认证）
      const current = getCurrentAuth();
      expect(current).toBeDefined();
      expect(current?.userId).toBe(50022);
      expect(current?.username).toBe('workspace-user');
    });

    it('should fall back to global auth when workspace auth not exists', () => {
      const globalAuth: AuthInfo = {
        userId: 50021,
        username: 'global-user',
        email: 'global@example.com',
        token: 'global-token',
        authorization: 'Bearer global-token',
      };

      // 只保存全局认证
      saveAuth(globalAuth, true);

      // 获取当前认证（应该返回全局认证）
      const current = getCurrentAuth();
      expect(current).toBeDefined();
      expect(current?.userId).toBe(50021);
      expect(current?.username).toBe('global-user');
    });
  });

  describe('Logout Flow', () => {
    it('should clear global auth', () => {
      const authInfo: AuthInfo = {
        userId: 50021,
        username: 'testuser',
        email: 'test@example.com',
        token: 'test-token',
        authorization: 'Bearer test-token',
      };

      // 保存并清除
      saveAuth(authInfo, true);
      expect(getAuth(true)).toBeDefined();

      clearAuth(true);
      expect(getAuth(true)).toBeNull();
    });

    it('should clear workspace auth', () => {
      vol.mkdirpSync('/test/project');
      
      const authInfo: AuthInfo = {
        userId: 50022,
        username: 'workspace-user',
        email: 'workspace@example.com',
        token: 'workspace-token',
        authorization: 'Bearer workspace-token',
      };

      // 保存并清除
      saveAuth(authInfo, false);
      expect(getAuth(false)).toBeDefined();

      clearAuth(false);
      expect(getAuth(false)).toBeNull();
    });

    it('should not affect global auth when clearing workspace auth', () => {
      vol.mkdirpSync('/test/project');
      
      const globalAuth: AuthInfo = {
        userId: 50021,
        username: 'global-user',
        email: 'global@example.com',
        token: 'global-token',
        authorization: 'Bearer global-token',
      };

      const workspaceAuth: AuthInfo = {
        userId: 50022,
        username: 'workspace-user',
        email: 'workspace@example.com',
        token: 'workspace-token',
        authorization: 'Bearer workspace-token',
      };

      // 保存两个认证
      saveAuth(globalAuth, true);
      saveAuth(workspaceAuth, false);

      // 清除工作空间认证
      clearAuth(false);

      // 验证全局认证仍然存在
      expect(getAuth(true)).toBeDefined();
      expect(getAuth(false)).toBeNull();
    });
  });

  describe('Auth Requirement', () => {
    it('should return auth when logged in', () => {
      const authInfo: AuthInfo = {
        userId: 50021,
        username: 'testuser',
        email: 'test@example.com',
        token: 'test-token',
        authorization: 'Bearer test-token',
      };

      saveAuth(authInfo, true);

      const auth = requireAuth();
      expect(auth).toBeDefined();
      expect(auth.userId).toBe(50021);
    });

    it('should throw AuthError when not logged in', () => {
      expect(() => requireAuth()).toThrow(AuthError);
      expect(() => requireAuth()).toThrow('请先登录');
    });
  });

  describe('Token Encryption', () => {
    it('should encrypt token when saving', () => {
      const authInfo: AuthInfo = {
        userId: 50021,
        username: 'testuser',
        email: 'test@example.com',
        token: 'plain-token-123',
        authorization: 'Bearer plain-token-123',
      };

      saveAuth(authInfo, true);

      // 直接读取文件
      const globalAuthPath = '/home/testuser/.freelog/auth.json';
      const fileContent = vol.readFileSync(globalAuthPath, 'utf-8') as string;
      const savedData = JSON.parse(fileContent);

      // 验证 token 已加密（不等于原始 token）
      expect(savedData.encrypted).toBe(true);
      expect(savedData.token).not.toBe('plain-token-123');
    });

    it('should decrypt token when retrieving', () => {
      const authInfo: AuthInfo = {
        userId: 50021,
        username: 'testuser',
        email: 'test@example.com',
        token: 'plain-token-123',
        authorization: 'Bearer plain-token-123',
      };

      saveAuth(authInfo, true);
      const retrieved = getAuth(true);

      // 验证 token 已解密（等于原始 token）
      expect(retrieved?.token).toBe('plain-token-123');
      expect(retrieved?.authorization).toBe('Bearer plain-token-123');
    });
  });
});

