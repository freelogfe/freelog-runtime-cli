import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionReadonlyCommands } from '../../src/commands/collection/readonly';
import * as reads from '../../src/domain/collection/readonly';
import * as tty from '../../src/core/tty';
import { CliError } from '../../src/core/errors';

const contract = { contractId: 'contract_1', licensorId: 'collection_1', subjectId: 'collection_1', subjectType: 1, policyId: 'policy_1', licenseeId: 'buyer',
  contractName: '策略', status: 0, authStatus: 128, createDate: 'created', updateDate: 'updated' };
describe('C11.R06～R08 只读命令输出和翻页', () => {
  afterEach(() => vi.restoreAllMocks());
  it('128明确未授权，不用原始JSON充当可读提示', async () => {
    vi.spyOn(reads, 'listCollectionContracts').mockResolvedValue([contract]); vi.spyOn(tty, 'isInteractive').mockReturnValue(false);
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionReadonlyCommands()[1]!.parseAsync(['list', '--all', '--yes', '--resource', 'id:collection_1'], { from: 'user' });
    expect(out.mock.calls.flat().join('\n')).toContain('未获得授权（如需支付请在浏览器处理）');
    expect(out.mock.calls.flat().join('\n')).toContain('policy_1');
    expect(reads.listCollectionContracts).toHaveBeenCalledWith(expect.objectContaining({ all: true, yes: true }));
  });
  it('JSON不提问、不混提示，完整保留未知字段', async () => {
    const rows = [{ ...contract, futureField: { nested: true } }];
    vi.spyOn(reads, 'listCollectionContracts').mockResolvedValue(rows); vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    const select = vi.spyOn(tty, 'selectQuestion'); const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionReadonlyCommands()[1]!.parseAsync(['list', '--json', '--resource', 'id:collection_1'], { from: 'user' });
    expect(out).toHaveBeenCalledExactlyOnceWith(JSON.stringify(rows, null, 2)); expect(select).not.toHaveBeenCalled();
    expect(vi.mocked(reads.listCollectionContracts).mock.calls[0]![0].nextPage).toBeUndefined();
  });
  it.each(['log', 'contract'] as const)('TTY的%s --json --all缺yes时不能调用域层或弹问句', async (kind) => {
    const logs = vi.spyOn(reads, 'listCollectionUpdateLogs').mockResolvedValue([]);
    const contracts = vi.spyOn(reads, 'listCollectionContracts').mockResolvedValue([]);
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    const confirm = vi.spyOn(tty, 'confirmQuestion'); const select = vi.spyOn(tty, 'selectQuestion');
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(createCollectionReadonlyCommands()[kind === 'log' ? 0 : 1]!.parseAsync(['list', '--json', '--all', '--resource', 'id:collection_1'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_READ_ALL_NEED_YES' });
    expect(logs).not.toHaveBeenCalled(); expect(contracts).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled(); expect(out).not.toHaveBeenCalled();
  });
  it.each([false, true])('普通TTY yes=%s仍逐页选择，不在返回后重复打印', async (yes) => {
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true); const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const select = vi.spyOn(tty, 'selectQuestion').mockResolvedValue('stop');
    const list = vi.spyOn(reads, 'listCollectionContracts').mockImplementation(async (input) => {
      if (input.nextPage) await input.nextPage({ rows: [contract], skip: 0, limit: 100, totalItem: 101, hasNext: true });
      return [contract];
    });
    await createCollectionReadonlyCommands()[1]!.parseAsync(['list', '--resource', 'id:collection_1', ...(yes ? ['--yes'] : [])], { from: 'user' });
    expect(list.mock.calls[0]![0].nextPage).toBeTypeOf('function'); expect(select).toHaveBeenCalledTimes(1); expect(out).toHaveBeenCalledTimes(1);
  });
  it('JSON整批失败时不打印残缺列表或成功提示', async () => {
    vi.spyOn(reads, 'listCollectionUpdateLogs').mockRejectedValue(new CliError('后页无效', 'COLLECTION_LOG_RESPONSE_INVALID'));
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(createCollectionReadonlyCommands()[0]!.parseAsync(['list', '--all', '--yes', '--json', '--resource', 'id:collection_1'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_LOG_RESPONSE_INVALID' });
    expect(out).not.toHaveBeenCalled();
  });
  it('未知整数合同/授权状态保留原值，不猜已授权', async () => {
    vi.spyOn(reads, 'listCollectionContracts').mockResolvedValue([{ ...contract, status: 999, authStatus: 998 }]);
    vi.spyOn(tty, 'isInteractive').mockReturnValue(false); const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionReadonlyCommands()[1]!.parseAsync(['list', '--resource', 'id:collection_1'], { from: 'user' });
    expect(out.mock.calls.flat().join('\n')).toContain('合同状态：未识别 999');
    expect(out.mock.calls.flat().join('\n')).toContain('授权状态：未识别 998');
  });
  it.each(['FUTURE', '__proto__', 'constructor'])('未知日志操作%s必须标未识别，不读取对象原型标签', async (operationType) => {
    vi.spyOn(reads, 'listCollectionUpdateLogs').mockResolvedValue([{ resourceId: 'collection_1', createDate: 'time', operations: [{ operationType, operationItems: [] }] }]);
    vi.spyOn(tty, 'isInteractive').mockReturnValue(false); const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionReadonlyCommands()[0]!.parseAsync(['list', '--resource', 'id:collection_1'], { from: 'user' });
    expect(out.mock.calls.flat().join('\n')).toContain(`操作：未识别 ${JSON.stringify(operationType)}`);
    expect(out.mock.calls.flat().join('\n')).toContain('本页第1条（非ID）');
  });
});
