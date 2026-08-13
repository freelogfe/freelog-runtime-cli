import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/sync/fetch.js', () => ({
  fetchResourceInfo: vi.fn(),
}));

vi.mock('../src/services/versionPropertyService.js', () => ({
  fetchReleasedVersionSnapshot: vi.fn(),
}));

import { fetchResourceInfo } from '../src/services/sync/fetch.js';
import { fetchReleasedVersionSnapshot } from '../src/services/versionPropertyService.js';
import { fetchSessionDeclaredAuthSubjects } from '../src/services/depSessionSources.js';

describe('fetchSessionDeclaredAuthSubjects (Console L587-604)', () => {
  beforeEach(() => {
    vi.mocked(fetchResourceInfo).mockReset();
    vi.mocked(fetchReleasedVersionSnapshot).mockReset();
  });

  it('combines resourceVersionInfo1 deps with fetchResourceInfo.baseUpcastResources', async () => {
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'parent-1',
      latestVersion: '1.0.0',
      baseUpcastResources: [{ resourceId: 'up-1', resourceName: 'alice/up' }],
    });
    vi.mocked(fetchReleasedVersionSnapshot).mockResolvedValue({
      fileSha1: 'a'.repeat(40),
      filename: 'f.zip',
      dependencies: [{ resourceId: 'dep-1', versionRange: '>=1.0.0' }],
      inputAttrs: [],
      customPropertyDescriptors: [],
    });

    const result = await fetchSessionDeclaredAuthSubjects({ resourceId: 'parent-1' });
    expect(result.dependencies[0]?.resourceId).toBe('dep-1');
    expect(result.baseUpcastResources[0]?.resourceId).toBe('up-1');
    expect(result.authTreeVersion).toBe('1.0.0');
    expect(fetchReleasedVersionSnapshot).toHaveBeenCalledWith({
      resourceId: 'parent-1',
      version: '1.0.0',
    });
  });
});
