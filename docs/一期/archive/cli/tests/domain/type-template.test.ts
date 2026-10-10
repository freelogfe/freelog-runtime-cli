import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  formatTypeList,
  formatTypeInfo,
  getTypeInfo,
  listLeafTypes,
  searchLeafTypes,
  supportsOptionalConfig,
  formatTypeListPage,
  typeListPage,
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
  it('mock 类型树列出叶子完整路径，prod 失败', async () => {
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
            name: '祖父节点',
            isTerminate: false,
            children: [
              {
                code: 'PARENT', name: '父节点', isTerminate: false, children: [
                  { code: 'VIDEO', name: '视频', nameChain: '伪造路径', isTerminate: true, status: 1, subjectType: 1 },
                ],
              },
              { code: 'OFF', name: '停用', isTerminate: true, status: 0, subjectType: 1 },
            ],
          },
        ],
      }),
    });
    expect(leaves.map((item) => item.code)).toEqual(['VIDEO']);
    expect(formatTypeList(leaves)).toBe('VIDEO\t祖父节点 / 父节点 / 视频');
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

  it('搜索结果也从类型树取得完整路径，而非信任搜索接口的 nameChain', async () => {
    applyCliEnv({ flag: 'test' });
    const found = await searchLeafTypes('视频', {
      searchLeaves: async (params) => {
        expect(params.category).toBe(1);
        expect(params.isTerminate).toBe(true);
        expect(params.subjectType).toBe(1);
        return {
          // dev 搜索接口只保证候选 code/name，叶子字段须由完整类型树复验。
          data: [{ code: 'VIDEO', name: '视频', nameChain: '伪造路径' }],
        };
      },
      resourceTypes: async () => ({
        data: [{
          code: 'GROUP', name: '祖父节点', status: 1, subjectType: 1, children: [{
            code: 'PARENT', name: '父节点', status: 1, subjectType: 1, children: [{
              code: 'VIDEO', name: '视频', isTerminate: true, status: 1, subjectType: 1,
            }],
          }],
        }],
      }),
    });
    expect(found).toHaveLength(1);
    expect(formatTypeList(found)).toBe('VIDEO\t祖父节点 / 父节点 / 视频');

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

  it('类型列表以固定 50 条分页且每页保留完整路径', () => {
    const types = Array.from({ length: 51 }, (_, index) => ({
      code: `TYPE_${index + 1}`,
      name: `叶子${index + 1}`,
      nameChain: `祖父节点 / 父节点 / 叶子${index + 1}`,
    }));
    const first = typeListPage(types, 1);
    const second = typeListPage(types, 2);
    expect(first.items).toHaveLength(50);
    expect(first.hasNext).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(formatTypeListPage(first)).toContain('第 1/2 页，共 51 个可用最终叶子类型');
    expect(formatTypeListPage(first)).toContain('TYPE_50\t祖父节点 / 父节点 / 叶子50');
    expect(formatTypeListPage(first)).not.toContain('TYPE_51');
  });
});
