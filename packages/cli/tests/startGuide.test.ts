import { describe, expect, it } from 'vitest';
import { buildStartGuide } from '../src/services/startGuide.js';
import type { StatusPayload } from '../src/services/statusService.js';

function status(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    ok: true,
    environment: 'dev',
    apiBaseURL: 'https://api.devfreelog.com',
    loggedIn: true,
    auth: null,
    owner: null,
    sync: 'unknown',
    platform: null,
    platformVersionDraft: null,
    localDraftSync: null,
    draftAdvice: null,
    draftAdviceHint: null,
    local: {
      resourceId: null,
      version: null,
      runtimeVersion: null,
      filePath: null,
    },
    collection: null,
    configs: {
      resource: null,
      version: null,
      collection: null,
    },
    ...overrides,
  };
}

describe('start guide', () => {
  it('recommends publishing a new resource in an empty directory', () => {
    const guide = buildStartGuide(status());
    expect(guide.recommendedTaskId).toBe('publish-new');
    expect(guide.tasks.map((task) => task.id)).toContain('policy-online');
    const commands = guide.tasks.find((task) => task.id === 'publish-new')?.nextCommands.join('\n') || '';
    expect(commands).toContain('init theme');
    expect(commands).toContain('init <目录> --scaffold none');
    expect(commands).not.toContain('init other');
  });

  it('recommends updating the current project when a resource manifest exists', () => {
    const guide = buildStartGuide(
      status({
        configs: { resource: '/repo/freelog.manifest.json', version: null, collection: null },
        local: { resourceId: 'resource-1', version: null, runtimeVersion: null, filePath: null },
      }),
    );
    expect(guide.recommendedTaskId).toBe('update-local');
    expect(guide.summary.resourceId).toBe('resource-1');
  });

  it('recommends collection flow when a collection manifest exists', () => {
    const guide = buildStartGuide(
      status({
        collection: {
          resourceId: 'collection-1',
          itemCount: 0,
          hasCollectRules: false,
          rssFeedUrl: null,
          draftSync: null,
          platformFormDraftExists: null,
          platformFormDraft: null,
          draftAdvice: null,
          draftAdviceHint: null,
        },
        configs: { resource: null, version: null, collection: '/repo/freelog.manifest.json' },
      }),
    );
    expect(guide.recommendedTaskId).toBe('collection');
    expect(guide.summary.collectionId).toBe('collection-1');
    const commands = guide.tasks.find((task) => task.id === 'collection')?.nextCommands.join('\n') || '';
    expect(commands).toContain('init <目录> --scaffold collection');
    expect(commands).toContain('collection rss inspect');
    expect(commands).not.toContain('collection rss preview');
  });
});
