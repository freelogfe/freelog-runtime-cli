/**
 * 配置服务测试
 */

import path from 'path';
import { vol } from 'memfs';
import {
  getConfigPath,
  validateConfig,
  configToVersionBody,
} from '../../../src/services/configService';
import { ConfigError, ValidationError } from '../../../src/core/errors';
import type { FreelogConfig } from '../../../public/freelog';

// Mock fs-extra
jest.mock('fs-extra', () => {
  const memfs = require('memfs');
  return {
    ...memfs.fs,
    existsSync: (path: string) => memfs.vol.existsSync(path),
    readFileSync: (path: string, encoding?: string) => memfs.vol.readFileSync(path, encoding),
    writeFileSync: (path: string, data: any) => memfs.vol.writeFileSync(path, data),
    writeFile: jest.fn(async (path: string, data: any) => {
      memfs.vol.writeFileSync(path, data);
    }),
    ensureDir: jest.fn(async (dir: string) => {
      memfs.vol.mkdirpSync(dir);
    }),
  };
});

describe('ConfigService', () => {
  beforeEach(() => {
    vol.reset();
    // 模拟当前工作目录
    process.cwd = jest.fn(() => '/test/project');
  });

  afterEach(() => {
    vol.reset();
  });

  describe('getConfigPath', () => {
    it('should return custom path when provided', () => {
      const customPath = 'custom/config.ts';
      const result = getConfigPath(customPath);
      
      expect(result).toBe(path.resolve('/test/project', customPath));
    });

    it('should find freelog.config.ts', () => {
      vol.mkdirpSync('/test/project');
      vol.writeFileSync('/test/project/freelog.config.ts', '');
      
      const result = getConfigPath();
      
      expect(result).toBe('/test/project/freelog.config.ts');
    });

    it('should find freelog.config.js', () => {
      vol.mkdirpSync('/test/project');
      vol.writeFileSync('/test/project/freelog.config.js', '');
      
      const result = getConfigPath();
      
      expect(result).toBe('/test/project/freelog.config.js');
    });

    it('should find freelog.json5', () => {
      vol.mkdirpSync('/test/project');
      vol.writeFileSync('/test/project/freelog.json5', '');
      
      const result = getConfigPath();
      
      expect(result).toBe('/test/project/freelog.json5');
    });

    it('should find freelog.json', () => {
      vol.mkdirpSync('/test/project');
      vol.writeFileSync('/test/project/freelog.json', '');
      
      const result = getConfigPath();
      
      expect(result).toBe('/test/project/freelog.json');
    });

    it('should throw error when no config file found', () => {
      vol.mkdirpSync('/test/project');
      
      expect(() => getConfigPath()).toThrow(ConfigError);
      expect(() => getConfigPath()).toThrow('找不到配置文件');
    });

    it('should prefer .ts over .js', () => {
      vol.mkdirpSync('/test/project');
      vol.writeFileSync('/test/project/freelog.config.ts', '');
      vol.writeFileSync('/test/project/freelog.config.js', '');
      
      const result = getConfigPath();
      
      expect(result).toBe('/test/project/freelog.config.ts');
    });
  });

  describe('validateConfig', () => {
    it('should pass validation for valid config', () => {
      const config: FreelogConfig = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
      };
      
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw error when resourceId is missing', () => {
      const config = {
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
      } as any;
      
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('缺少必填字段: resourceId');
    });

    it('should throw error when version is missing', () => {
      const config = {
        resourceId: '5ef081b8fb172026e434e2fa',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
      } as any;
      
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('缺少必填字段: version');
    });

    it('should throw error when fileSha1 is missing', () => {
      const config = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        filename: 'resource.zip',
      } as any;
      
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('缺少必填字段: fileSha1');
    });

    it('should throw error when filename is missing', () => {
      const config = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
      } as any;
      
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('缺少必填字段: filename');
    });

    it('should throw error with multiple missing fields', () => {
      const config = {
        resourceId: '5ef081b8fb172026e434e2fa',
      } as any;
      
      expect(() => validateConfig(config)).toThrow(ValidationError);
      expect(() => validateConfig(config)).toThrow('缺少必填字段');
    });
  });

  describe('configToVersionBody', () => {
    it('should convert config to version body', () => {
      const config: FreelogConfig = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
        description: '测试版本',
        dependencies: [
          {
            resourceId: '5ef081b8fb172026e434e2fc',
            versionRange: '^1.0.0',
          },
        ],
        customPropertyDescriptors: [
          {
            key: 'theme',
            defaultValue: 'light',
            type: 'select',
            candidateItems: ['light', 'dark'],
          },
        ],
      };
      
      const result = configToVersionBody(config);
      
      expect(result).toEqual({
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
        description: '测试版本',
        dependencies: [
          {
            resourceId: '5ef081b8fb172026e434e2fc',
            versionRange: '^1.0.0',
          },
        ],
        customPropertyDescriptors: [
          {
            key: 'theme',
            defaultValue: 'light',
            type: 'select',
            candidateItems: ['light', 'dark'],
          },
        ],
      });
      
      // resourceId 不应该出现在结果中
      expect(result).not.toHaveProperty('resourceId');
    });

    it('should handle minimal config', () => {
      const config: FreelogConfig = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
      };
      
      const result = configToVersionBody(config);
      
      expect(result).toEqual({
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
      });
    });

    it('should include optional fields when present', () => {
      const config: FreelogConfig = {
        resourceId: '5ef081b8fb172026e434e2fa',
        version: '1.0.0',
        fileSha1: '4a10ed3b6e45f8014b8240ad37f44cfc9c75e754',
        filename: 'resource.zip',
        baseUpcastResources: [
          { resourceId: '5ef081b8fb172026e434e2fd' },
        ],
        batchSignContracts: [
          {
            resourceId: '5ef081b8fb172026e434e2fe',
            subjectType: 1,
            policyIds: ['policy1'],
          },
        ],
      };
      
      const result = configToVersionBody(config);
      
      expect(result.baseUpcastResources).toEqual([
        { resourceId: '5ef081b8fb172026e434e2fd' },
      ]);
      expect(result.batchSignContracts).toEqual([
        {
          resourceId: '5ef081b8fb172026e434e2fe',
          subjectType: 1,
          policyIds: ['policy1'],
        },
      ]);
    });
  });
});

