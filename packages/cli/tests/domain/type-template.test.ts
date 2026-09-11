import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  formatTypeList,
  formatTypeInfo,
  getTypeInfo,
  listLeafTypes,
  searchLeafTypes,
  supportsOptionalConfig,
} from '../../src/domain/create/typePick';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { getTemplate, listTemplates } from '../../src/domain/init/templates';

afterEach(() => {
  resetEnvForTests();
});

describe('template list', () => {
  it('列出固定版本的主题/插件模板，并拒绝未知 id', () => {
    const runtime = listTemplates();
    expect(runtime.map((item) => item.id)).toContain('vite-react-ts');
    expect(runtime.every((item) => item.version === '4.0.0')).toBe(true);
    expect(getTemplate('vite-react-ts', 'theme').npmName).toBe('@freelog-cli/template-vite-react-ts');
    expect(() => getTemplate('not-exist', 'theme')).toThrow(CliError);
  });
});

describe('type', () => {
  it('mock 类型树列出叶子，prod 失败', async () => {
    applyCliEnv({ flag: 'prod' });
    await expect(listLeafTypes()).rejects.toMatchObject({
      message: 'prod 暂未开放，请用 --env test 或 --env dev',
    });

    applyCliEnv({ flag: 'test' });
    const leaves = await listLeafTypes({
      resourceTypes: async () => ({
        data: [
          {
            code: 'GROUP',
            name: '组',
            isTerminate: false,
            children: [
              { code: 'VIDEO', name: '视频', nameChain: '媒体/视频', isTerminate: true, status: 1, subjectType: 1 },
              { code: 'OFF', name: '停用', isTerminate: true, status: 0, subjectType: 1 },
            ],
          },
        ],
      }),
    });
    expect(leaves.map((item) => item.code)).toEqual(['VIDEO']);
    expect(formatTypeList(leaves)).toContain('VIDEO');
  });

  it('兼容平台类型树的 subjectType 数组和无 isTerminate 叶子，并在详情接口严格复验', async () => {
    applyCliEnv({ flag: 'test' });
    const leaves = await listLeafTypes({
      resourceTypes: async () => ({
        data: [
          { code: 'THEME', name: '主题', status: 1, subjectType: [1], children: [] },
          { code: 'PLUGIN', name: '插件', status: 1, subjectType: ['1'], children: '' },
        ],
      }),
    });
    expect(leaves.map((item) => item.code)).toEqual(['THEME', 'PLUGIN']);

    const info = await getTypeInfo('THEME', {
      getByCode: async ({ code }) => ({
        data: { code, name: '主题', isTerminate: true, status: 1, subjectType: [1] },
      }),
    });
    expect(info.code).toBe('THEME');
    const nestedCapability = await getTypeInfo('THEME', {
      getByCode: async ({ code }) => ({
        data: {
          code, name: '主题', isTerminate: true, status: 1, subjectType: [1],
          resourceConfig: { supportOptionalConfig: 2 },
        },
      }),
    });
    expect(nestedCapability.supportOptionalConfig).toBe(2);
    expect(supportsOptionalConfig(nestedCapability)).toBe(true);
    expect(formatTypeInfo(nestedCapability)).toBe('THEME\t主题\t可选配置：支持');
    expect(formatTypeInfo({ ...info, supportOptionalConfig: 2 })).toBe('THEME\t主题\t可选配置：支持');
    expect(formatTypeInfo(info)).toBe('THEME\t主题\t可选配置：不支持');
    // 后台嵌套配置是权威来源；不能让旧接口残留的顶层字段把它覆盖。
    expect(supportsOptionalConfig({
      resourceConfig: { supportOptionalConfig: 1 },
      supportOptionalConfig: 2,
    })).toBe(false);
  });

  it('search / info mock 叶子接口', async () => {
    applyCliEnv({ flag: 'test' });
    const found = await searchLeafTypes('视频', {
      searchLeaves: async (params) => {
        expect(params.isTerminate).toBe(true);
        expect(params.subjectType).toBe(1);
        return {
          data: [{ code: 'VIDEO', name: '视频', isTerminate: true, status: 1, subjectType: 1 }],
        };
      },
    });
    expect(found).toHaveLength(1);

    const info = await getTypeInfo('VIDEO', {
      getByCode: async ({ code }) => ({
        data: { code, name: '视频', isTerminate: true, status: 1, subjectType: 1 },
      }),
    });
    expect(info.code).toBe('VIDEO');

    await expect(
      getTypeInfo('GROUP', {
        getByCode: async () => ({
          data: { code: 'GROUP', name: '组', isTerminate: false, status: 1 },
        }),
      }),
    ).rejects.toMatchObject({ code: 'TYPE_NOT_LEAF' });
  });
});
