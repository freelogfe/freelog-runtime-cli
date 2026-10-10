import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateProject: vi.fn(),
  ensureSynced: vi.fn(),
  ensureSyncedReadOnly: vi.fn(),
  publishVersion: vi.fn(),
  loadVersionProject: vi.fn(),
  saveVersionProject: vi.fn(),
}));

vi.mock('../src/core/command.js', () => ({ assertExplicitEnvForWriteOperation: vi.fn() }));
vi.mock('../src/config/project.js', () => ({
  resolveCwd: (cwd?: string) => cwd || '/project',
  tryLoadCollectionProject: vi.fn(() => null),
  loadVersionProject: mocks.loadVersionProject,
  saveVersionProject: mocks.saveVersionProject,
}));
vi.mock('../src/services/sync/index.js', () => ({ ensureSynced: mocks.ensureSynced }));
vi.mock('../src/services/resource/publishVersion.js', () => ({
  ensureSyncedReadOnly: mocks.ensureSyncedReadOnly,
  publishVersion: mocks.publishVersion,
}));
vi.mock('../src/services/validateService.js', () => ({ validateProject: mocks.validateProject }));
vi.mock('../src/services/onlineService.js', () => ({ onlineResource: vi.fn() }));
vi.mock('../src/services/collection/index.js', () => ({ collectionPublish: vi.fn() }));
vi.mock('../src/services/collection/maintenance.js', () => ({ collectionVersionSet: vi.fn() }));
vi.mock('../src/services/gitChangelog.js', () => ({ readLatestGitCommitMessage: vi.fn() }));

import { releaseProject } from '../src/services/releaseService.js';

describe('releaseProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadVersionProject.mockReturnValue({
      data: { version: '1.0.0', filePath: 'artifact.zip' },
    });
    mocks.ensureSynced.mockResolvedValue({ info: { latestVersion: '1.0.0' } });
    mocks.validateProject.mockResolvedValue({ ok: true, checks: [] });
    mocks.publishVersion.mockResolvedValue({ ok: true });
  });

  it('validates the planned bumped version before persisting and publishing it', async () => {
    const result = await releaseProject({ cwd: '/project', bump: 'patch' });

    expect(mocks.validateProject).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'publish', versionOverride: '1.0.1' }),
    );
    expect(mocks.saveVersionProject).toHaveBeenCalledWith(
      expect.objectContaining({ version: '1.0.1' }),
      '/project',
    );
    expect(mocks.publishVersion).toHaveBeenCalledWith(
      expect.objectContaining({ bump: false, versionOverride: '1.0.1' }),
    );
    expect(result.bumped).toBe('1.0.1');
  });
});
