import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyWriteCommandFlags: vi.fn(),
  draftDiscard: vi.fn(),
  draftPull: vi.fn(),
  draftPush: vi.fn(),
  collectionDraftDiscard: vi.fn(),
  collectionDraftPull: vi.fn(),
  collectionDraftPush: vi.fn(),
}));

vi.mock('../src/core/command.js', () => ({
  applyWriteCommandFlags: mocks.applyWriteCommandFlags,
  handleCommandError: (error: unknown) => {
    throw error;
  },
  writeJsonSuccess: vi.fn(),
}));

vi.mock('../src/services/draftService.js', () => ({
  draftDiscard: mocks.draftDiscard,
  draftPull: mocks.draftPull,
  draftPush: mocks.draftPush,
}));

vi.mock('../src/services/collectionDraftService.js', () => ({
  collectionDraftDiscard: mocks.collectionDraftDiscard,
  collectionDraftPull: mocks.collectionDraftPull,
  collectionDraftPush: mocks.collectionDraftPush,
}));

import { draftCommand } from '../src/commands/draft.js';

describe('draft session mode guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['push', 'pull', 'discard'] as const)('rejects draft %s in session mode before any draft API call', async (name) => {
    const command = draftCommand.subCommands?.[name];
    await expect(
      command?.run?.({ args: { session: true, yes: true, env: 'dev' } } as never),
    ).rejects.toMatchObject({
      code: 4,
      message: expect.stringMatching(/会话模式不支持 draft 命令/),
    });

    expect(mocks.applyWriteCommandFlags).not.toHaveBeenCalled();
    expect(mocks.draftPush).not.toHaveBeenCalled();
    expect(mocks.draftPull).not.toHaveBeenCalled();
    expect(mocks.draftDiscard).not.toHaveBeenCalled();
    expect(mocks.collectionDraftPush).not.toHaveBeenCalled();
    expect(mocks.collectionDraftPull).not.toHaveBeenCalled();
    expect(mocks.collectionDraftDiscard).not.toHaveBeenCalled();
  });
});
