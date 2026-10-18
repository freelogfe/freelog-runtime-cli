import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';

const io = vi.hoisted(() => ({
  existsSync: vi.fn(), readdirSync: vi.fn(), readAnyIdentity: vi.fn(), readDraft: vi.fn(),
  readPendingOperation: vi.fn(), normalizeProjectPath: vi.fn(),
}));
vi.mock('node:fs', () => ({ existsSync: io.existsSync, readdirSync: io.readdirSync }));
vi.mock('../../src/local/identity', () => ({ freelogDir: () => '/fake/.freelog', readAnyIdentity: io.readAnyIdentity }));
vi.mock('../../src/local/draft', () => ({ readDraft: io.readDraft }));
vi.mock('../../src/local/pendingOperation', () => ({ readPendingOperation: io.readPendingOperation }));
vi.mock('../../src/local/projectPath', () => ({ normalizeProjectPath: io.normalizeProjectPath }));
import { diagnoseLocalState } from '../../src/local/diagnostics';

const privateMessage = 'Authorization: Bearer FAKE_DIAGNOSTIC_AUTH; Cookie: FAKE_DIAGNOSTIC_COOKIE; password=FAKE_DIAGNOSTIC_PASSWORD';
const identity = { n: 1, subject: 'resource', resourceId: 'res_diagnostic', typeCode: 'VIDEO', filePath: 'clip.mp4' };

describe('只读本地诊断的正常文本安全边界', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    io.existsSync.mockReturnValue(true);
    io.readdirSync.mockReturnValue(['1.json', '1.version.json']);
    io.readAnyIdentity.mockReturnValue(identity);
    io.readDraft.mockReturnValue({ draftKind: 'initial' });
    io.normalizeProjectPath.mockImplementation((_cwd, raw) => raw);
  });

  it.each([
    { name: '目录', read: 'readdirSync', expected: '无法读取 .freelog：本地状态读取失败', calls: 1 },
    { name: '身份', read: 'readAnyIdentity', expected: '1.json [IDENTITY_INVALID]：本地状态读取失败', calls: 1 },
    { name: '工作稿', read: 'readDraft', expected: '1.version.json [DRAFT_INVALID]：本地状态读取失败', calls: 1 },
    { name: '未决记录', read: 'readPendingOperation', expected: '.pending-operation.json [PENDING_OPERATION_INVALID]：本地状态读取失败', calls: 1 },
    { name: '路径', read: 'normalizeProjectPath', expected: '1.json [IDENTITY_PATH_INVALID]：本地状态读取失败', calls: 1 },
  ] as const)('$name 的未知异常不进入正常文本', ({ read, expected, calls }) => {
    io[read].mockImplementation(() => { throw new Error(privateMessage, { cause: new Error(privateMessage) }); });
    const report = diagnoseLocalState('/fake');
    expect(report).toContain(expected);
    expect(report).not.toContain('FAKE_DIAGNOSTIC');
    expect(report).not.toContain('Authorization');
    expect(report).not.toContain('Cookie');
    expect(report).not.toContain('password');
    expect(io[read]).toHaveBeenCalledTimes(calls);
  });

  it('受控错误保留说明，诊断不访问其它写入能力', () => {
    io.readDraft.mockImplementation(() => { throw new CliError('工作稿 1.version.json 与身份不一致', 'DRAFT_IDENTITY_MISMATCH'); });
    expect(diagnoseLocalState('/fake')).toContain('1.version.json [DRAFT_INVALID]：工作稿 1.version.json 与身份不一致');
    expect(io.readDraft).toHaveBeenCalledExactlyOnceWith('/fake', 1);
  });
});
