import {afterEach,expect,it,vi} from 'vitest';
import {createCollectionItemCommand} from '../../src/commands/collection/item';
import * as items from '../../src/domain/collection/items';
afterEach(()=>vi.restoreAllMocks());
for(const kind of ['list','move','sort'] as const)it(`${kind} preserves rows while escaping control/format characters in terminal columns`,async()=>{
  const rows=[{itemId:'item_a',resourceId:'source_a',itemTitle:'A\tB\n\u001b[2J\u200b',resourceName:'alice/\u{E0001}name',sortId:1}];
  const fn=kind==='list'?'listCollectionDraftItems':kind==='move'?'moveCollectionDraftItem':'sortCollectionDraftItems';
  vi.spyOn(items,fn).mockResolvedValue(rows);const output=vi.spyOn(console,'log').mockImplementation(()=>{});
  const argv=kind==='list'?['list']:kind==='move'?['move','item_a','--before','item_b','--yes']:['sort','--by','title','--asc','--yes'];
  await createCollectionItemCommand().parseAsync([...argv,'--resource','id:local_collection'],{from:'user'});
  expect(output).toHaveBeenCalledExactlyOnceWith('item_a\tsource_a\tA\\u0009B\\u000a\\u001b[2J\\u200b\talice/\\udb40\\udc01name');
  expect(rows[0]!.itemTitle).toBe('A\tB\n\u001b[2J\u200b');
});
