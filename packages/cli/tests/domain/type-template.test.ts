import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  formatTypeList,
  getTypeInfo,
  listLeafTypes,
  searchLeafTypes,
} from '../../src/domain/create/typePick';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { listTemplates } from '../../src/domain/init/templates';

afterEach(() => {
  resetEnvForTests();
});

describe('template list', () => {
  it('按 scaffold 列出模板', () => {
    const runtime = listTemplates('runtime');
    expect(runtime.length).toBeGreaterThan(0);
    expect(runtime.every((item) => item.scaffold === 'runtime')).toBe(true);
    expect(() => listTemplates('collection')).toThrow(CliError);
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
              { code: 'VIDEO', name: '视频', nameChain: '媒体/视频', isTerminate: true, status: 1 },
              { code: 'OFF', name: '停用', isTerminate: true, status: 0 },
            ],
          },
        ],
      }),
    });
    expect(leaves.map((item) => item.code)).toEqual(['VIDEO']);
    expect(formatTypeList(leaves)).toContain('VIDEO');
  });

  it('search / info mock 叶子接口', async () => {
    applyCliEnv({ flag: 'test' });
    const found = await searchLeafTypes('视频', {
      searchLeaves: async (params) => {
        expect(params.isTerminate).toBe(true);
        expect(params.subjectType).toBe(1);
        return {
          data: [{ code: 'VIDEO', name: '视频', isTerminate: true, status: 1 }],
        };
      },
    });
    expect(found).toHaveLength(1);

    const info = await getTypeInfo('VIDEO', {
      getByCode: async ({ code }) => ({
        data: { code, name: '视频', isTerminate: true, status: 1 },
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
