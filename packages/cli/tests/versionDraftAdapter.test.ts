import { consola } from 'consola';
import { describe, expect, it, vi } from 'vitest';
import {
  applyDraftToVersionConfig,
  decideDraftPush,
  fingerprint,
  toDraftData,
  type ResourceVersionDraftData,
} from '../src/adapters/versionDraftAdapter.js';
import type { VersionProject } from '../src/config/project.js';

function baseConfig(partial: Partial<VersionProject> = {}): VersionProject {
  return {
    version: '1.0.0',
    filePath: 'dist',
    description: 'hello',
    dependencies: [
      { resourceId: 'b', resourceName: 'B', versionRange: '^1.0.0' },
      { resourceId: 'a', resourceName: 'A', versionRange: '*' },
    ],
    ...partial,
  };
}

describe('versionDraftAdapter fingerprint', () => {
  it('stable when dependency order shuffled (#14)', () => {
    const d1: ResourceVersionDraftData = {
      versionInput: '1.0.0',
      descriptionEditorInput: 'x',
      selectedFileInfo: null,
      directDependencies: [
        { id: 'b', name: 'B', type: 'resource', versionRange: '^1' },
        { id: 'a', name: 'A', type: 'resource', versionRange: '*' },
      ],
    };
    const d2: ResourceVersionDraftData = {
      ...d1,
      directDependencies: [...(d1.directDependencies || [])].reverse(),
    };
    expect(fingerprint(d1)).toBe(fingerprint(d2));
  });

  it('changes when version changes', () => {
    const a = toDraftData(baseConfig({ version: '1.0.0' }));
    const b = toDraftData(baseConfig({ version: '1.0.1' }));
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe('toDraftData / applyDraftToVersionConfig', () => {
  it('does not put filePath into selectedFileInfo without sha1 (#7)', () => {
    const draft = toDraftData(baseConfig({ filePath: 'dist/app.zip' }));
    expect(draft.selectedFileInfo).toBeNull();
  });

  it('maps sha1+filename and preserves filePath on pull (#2)', () => {
    const draft = toDraftData(
      baseConfig({ fileSha1: 'abc', filename: 'app.zip', filePath: 'dist/keep' }),
    );
    expect(draft.selectedFileInfo).toEqual({
      name: 'app.zip',
      sha1: 'abc',
      from: 'freelog-cli',
    });
    const applied = applyDraftToVersionConfig(
      baseConfig({ filePath: 'dist/keep', description: 'old' }),
      {
        ...draft,
        descriptionEditorInput: 'from-console',
      },
    );
    expect(applied.filePath).toBe('dist/keep');
    expect(applied.description).toBe('from-console');
    expect(applied.fileSha1).toBe('abc');
  });

  it('maps readonlyText + editableText roundtrip (#9)', () => {
    const draft = toDraftData(
      baseConfig({
        customPropertyDescriptors: [
          {
            type: 'readonlyText',
            key: 'k1',
            name: 'N1',
            defaultValue: 'v1',
            remark: 'r1',
          },
          {
            type: 'editableText',
            key: 'k2',
            defaultValue: 'v2',
          },
        ],
      }),
    );
    expect(draft.customProperties?.[0]).toMatchObject({ key: 'k1', value: 'v1' });
    expect(draft.customConfigurations?.[0]).toMatchObject({ key: 'k2', type: 'input' });
    const back = applyDraftToVersionConfig(baseConfig(), draft);
    expect(back.customPropertyDescriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'readonlyText', key: 'k1' }),
        expect.objectContaining({ type: 'editableText', key: 'k2' }),
      ]),
    );
  });

  it('radio becomes select after roundtrip (#10)', () => {
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {});
    try {
      const draft = toDraftData(
        baseConfig({
          customPropertyDescriptors: [
            {
              type: 'radio',
              key: 'r',
              defaultValue: 'a',
              candidateItems: ['a', 'b'],
            },
          ],
        }),
      );
      expect(draft.customConfigurations?.[0]?.type).toBe('select');
      expect(warn).toHaveBeenCalledWith('自定义属性 radio/checkbox 推入草稿后将变为 select（有损）');
      const back = applyDraftToVersionConfig(baseConfig(), draft);
      expect(back.customPropertyDescriptors?.[0]?.type).toBe('select');
    } finally {
      warn.mockRestore();
    }
  });

  it('preserves authExcludedItems roundtrip', () => {
    const draft = toDraftData(
      baseConfig({
        authExcludedItems: [
          {
            resourceId: 'r1',
            excludedType: 'contractId',
            excludedValue: 'c1',
          },
        ],
      }),
    );

    expect(draft.authExcludedItems).toEqual([
      {
        resourceId: 'r1',
        excludedType: 'contractId',
        excludedValue: 'c1',
      },
    ]);

    const back = applyDraftToVersionConfig(baseConfig(), {
      ...draft,
      authExcludedItems: [
        {
          resourceId: 'r2',
          excludedType: 'policyId',
          excludedValue: 'p1',
        },
      ],
    });
    expect(back.authExcludedItems).toEqual([
      {
        resourceId: 'r2',
        excludedType: 'policyId',
        excludedValue: 'p1',
      },
    ]);
  });
});

describe('decideDraftPush conflicts', () => {
  const local = toDraftData(baseConfig({ version: '1.0.0' }));
  const localFp = fingerprint(local);
  const remoteOther = toDraftData(baseConfig({ version: '2.0.0' }));

  it('saves when no remote', () => {
    expect(decideDraftPush({ localFp, remote: null }).action).toBe('save');
  });

  it('conflicts when remote exists without sync (#16)', () => {
    const d = decideDraftPush({
      localFp,
      remote: { draftData: remoteOther, updateDate: 't1' },
      sync: null,
    });
    expect(d.action).toBe('conflict');
  });

  it('force overrides', () => {
    expect(
      decideDraftPush({
        localFp,
        remote: { draftData: remoteOther },
        sync: null,
        force: true,
      }).action,
    ).toBe('save');
  });

  it('fast-forward when only local dirty (#6)', () => {
    const syncFp = fingerprint(toDraftData(baseConfig({ version: '0.9.0' })));
    // remote still at last sync content
    const remoteAtSync = toDraftData(baseConfig({ version: '0.9.0' }));
    const d = decideDraftPush({
      localFp, // 1.0.0
      remote: { draftData: remoteAtSync, updateDate: 't0' },
      sync: { lastFingerprint: syncFp, lastRemoteUpdateDate: 't0' },
    });
    expect(d).toEqual({ action: 'save', reason: 'fast-forward' });
  });

  it('conflicts when remote dirty and local clean (#5)', () => {
    const syncFp = localFp;
    const d = decideDraftPush({
      localFp,
      remote: { draftData: remoteOther, updateDate: 't2' },
      sync: { lastFingerprint: syncFp, lastRemoteUpdateDate: 't1' },
    });
    expect(d.action).toBe('conflict');
    if (d.action === 'conflict') expect(d.reason).toBe('remote-dirty');
  });

  it('aligned when fingerprints match', () => {
    const d = decideDraftPush({
      localFp,
      remote: { draftData: local, updateDate: 't1' },
      sync: { lastFingerprint: 'old' },
    });
    expect(d).toEqual({ action: 'save', reason: 'aligned' });
  });
});
