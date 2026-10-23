/** C02 expectations come from the complete-catalogue edit contract, not the implementation. */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { renameCollectionDraftItem, removeCollectionDraftItems, moveCollectionDraftItem, sortCollectionDraftItems, type CollectionItemApis } from '../../src/domain/collection/items';
import * as tty from '../../src/core/tty';

vi.mock('../../src/core/tty', async original => ({ ...await original<typeof tty>(), confirmWrite: vi.fn() }));
type Operation = 'rename' | 'remove' | 'move' | 'sort';
const operations: Operation[] = ['rename', 'remove', 'move', 'sort'];
const initial = () => ['a','b','c','d'].map((id,index) => ({itemId:id,itemTitle:String.fromCharCode(68-index),sortId:index+1,mountResourceInfo:{resourceId:`source_${id}`}}));
type Row = ReturnType<typeof initial>[number];
const success = () => ({ret:0,errCode:0,data:null});
const page = (rows: Row[]) => ({ret:0,errCode:0,data:{skip:0,limit:100,totalItem:rows.length,dataList:structuredClone(rows)}});
const unknown = {code:'COLLECTION_ITEM_RESULT_UNKNOWN'};

describe('C02 complete item edit outcomes and confirmation races', () => {
  let cwd:string, homeDir:string;
  beforeEach(async () => {
    cwd=mkdtempSync(path.join(tmpdir(),'freelog-item-edit-'));homeDir=mkdtempSync(path.join(tmpdir(),'freelog-item-edit-home-'));
    applyCliEnv({flag:'test'});
    await loginAccount({cwd,homeDir,loginName:'alice',password:'synthetic',loginApi:async()=>({data:{userId:7,username:'alice',token:'synthetic'}})});
    writeFileSync(path.join(cwd,'keep.bin'),Buffer.from([0,255,254]));
    vi.mocked(tty.confirmWrite).mockImplementation(async preview=>preview);
  });
  afterEach(()=>{vi.restoreAllMocks();rmSync(cwd,{recursive:true,force:true});rmSync(homeDir,{recursive:true,force:true});resetEnvForTests();});
  const localBytes = (directory:string):unknown => readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>
    [e.name,e.isDirectory()?localBytes(path.join(directory,e.name)):readFileSync(path.join(directory,e.name)).toString('base64')]);
  function fixture(operation:Operation) {
    const state={rows:initial(),status:0,userId:7,rss:false,auto:0,reply:success() as unknown,postError:false,badReadback:false};
    const reads:Record<string,unknown>[]=[], writes:Record<string,unknown>[]=[];
    const expected = () => {
      const rows=initial();
      if(operation==='rename') rows[1]!.itemTitle='new';
      if(operation==='remove') return [rows[0]!,rows[2]!].map((r,i)=>({...r,sortId:i+1}));
      if(operation==='move') return [rows[0]!,rows[3]!,rows[1]!,rows[2]!].map((r,i)=>({...r,sortId:i+1}));
      if(operation==='sort') return [...rows].reverse().map((r,i)=>({...r,sortId:i+1}));
      return rows;
    };
    let afterWrite:((rows:Row[])=>Row[])|undefined;
    const write=vi.fn(async (params:Record<string,unknown>)=>{
      writes.push(structuredClone(params));state.rows=afterWrite?afterWrite(expected()):expected();
      if(state.postError)throw new Error('SYNTHETIC_PRIVATE_HTTP_DETAIL');return state.reply;
    });
    const apis:CollectionItemApis={
      info:async params=>{reads.push(structuredClone(params));return {ret:0,errCode:0,data:{resourceId:'collection_1',resourceName:'alice/collection',resourceTypeCode:'CT001',subjectType:[4],userId:state.userId,status:state.status,...(state.rss?{rssSource:'yes'}:{})}};},
      getRules:async()=>({ret:0,errCode:0,data:{serializeStatus:0,status:state.auto,conditionType:1,filterConditions:[]}}),
      getDraftItems:async()=>state.badReadback&&writes.length?{ret:1,errCode:0,data:null}:page(state.rows),
      renameDraftItems:write,removeDraftItems:write,moveDraftItems:write,reorderDraftItems:write,
    };
    const input={cwd,homeDir,selector:'name:alice/collection',yes:true,apis};
    const run=(patch:Record<string,unknown>={})=>operation==='rename'?renameCollectionDraftItem({...input,itemId:'b',title:' new ',...patch})
      :operation==='remove'?removeCollectionDraftItems({...input,itemIds:['b','d','b'],...patch})
        :operation==='move'?moveCollectionDraftItem({...input,itemId:'d',before:'b',...patch})
          :sortCollectionDraftItems({...input,by:'title',direction:'asc',...patch});
    return {state,writes,write,reads,run,expected,mutateResult:(fn:(rows:Row[])=>Row[])=>{afterWrite=fn;}};
  }
  it.each(operations)('%s only writes the intended catalogue fields once; local bytes unchanged',async operation=>{
    const f=fixture(operation),before=localBytes(cwd);await f.run();
    expect(f.state.rows).toEqual(f.expected());expect(localBytes(cwd)).toEqual(before);expect(f.write).toHaveBeenCalledTimes(1);
    const payloads={rename:{resourceId:'collection_1',data:[{itemId:'b',itemTitle:'new'}]},remove:{resourceId:'collection_1',removeCollectionItemIds:['b','d']},
      move:{resourceId:'collection_1',data:{itemIds:['d'],targetSortId:2}},sort:{resourceId:'collection_1',sortField:'itemTitle',sortType:1}};
    expect(f.writes).toEqual([payloads[operation]]);
    expect(f.reads.slice(1).every(p=>p.resourceIdOrName==='collection_1')).toBe(true);
  });
  for(const [label,response]of [['empty',{}],['null',null],['ret',{ret:1,errCode:0}],['errCode',{ret:0,errCode:1}],
    ['missing-ret',{errCode:0}],['missing-code',{ret:0}],['string',{ret:'0',errCode:0}]] as const)
    it.each(operations)(`%s refuses ${label} write acknowledgement even if final state matches`,async operation=>{
      const f=fixture(operation);f.state.reply=response;await expect(f.run()).rejects.toMatchObject(unknown);expect(f.write).toHaveBeenCalledTimes(1);
    });
  for(const [name,mutate]of [
    ['extra',(rows:Row[])=>[...rows,{...initial()[0]!,itemId:'extra'}]],
    ['missing',(rows:Row[])=>rows.filter(r=>r.itemId!=='a')],
    ['other-title',(rows:Row[])=>rows.map(r=>r.itemId==='a'?{...r,itemTitle:'unexpected'}:r)],
    ['source',(rows:Row[])=>rows.map(r=>r.itemId==='a'?{...r,mountResourceInfo:{resourceId:'replaced'}}:r)],
  ] as const)it.each(operations)(`%s rejects complete-result ${name}`,async operation=>{
    const f=fixture(operation);f.mutateResult(mutate);await expect(f.run()).rejects.toMatchObject(unknown);expect(f.write).toHaveBeenCalledTimes(1);
  });
  for(const [name,mutate]of [
    ['title',(f:ReturnType<typeof fixture>)=>{f.state.rows[0]!.itemTitle='concurrent';}],
    ['order',(f:ReturnType<typeof fixture>)=>{f.state.rows.reverse();}],
    ['source',(f:ReturnType<typeof fixture>)=>{f.state.rows[0]!.mountResourceInfo.resourceId='concurrent';}],
    ['membership',(f:ReturnType<typeof fixture>)=>{f.state.rows.pop();}],
  ] as const)it.each(operations)(`%s refuses confirmation race: ${name}, before any write`,async operation=>{
    const f=fixture(operation),before=localBytes(cwd);vi.mocked(tty.confirmWrite).mockImplementationOnce(async preview=>{mutate(f);return preview;});
    await expect(f.run()).rejects.toMatchObject({code:'COLLECTION_ITEM_CATALOGUE_CHANGED'});expect(f.write).not.toHaveBeenCalled();expect(localBytes(cwd)).toEqual(before);
  });
  for(const [name,mutate]of [
    ['frozen',(f:ReturnType<typeof fixture>)=>{f.state.status=2;}],['owner',(f:ReturnType<typeof fixture>)=>{f.state.userId=8;}],
    ['rss',(f:ReturnType<typeof fixture>)=>{f.state.rss=true;}],['auto',(f:ReturnType<typeof fixture>)=>{f.state.auto=1;}],
  ] as const)it.each(operations)(`%s rereads ${name} gate after confirmation and writes nothing`,async operation=>{
    const f=fixture(operation);vi.mocked(tty.confirmWrite).mockImplementationOnce(async preview=>{mutate(f);return preview;});
    await expect(f.run()).rejects.toBeDefined();expect(f.write).not.toHaveBeenCalled();
  });
  it.each(operations)('%s maps post exception and bad readback to safe unknown without retry',async operation=>{
    for(const kind of ['postError','badReadback'] as const){const f=fixture(operation);f.state[kind]=true;
      const error=await f.run().catch(e=>e);expect(error).toMatchObject(unknown);expect(error.message).not.toContain('SYNTHETIC_PRIVATE_HTTP_DETAIL');expect(f.write).toHaveBeenCalledTimes(1);}
  });
  it.each(operations)('%s cancellation leaves catalogue and local data unchanged',async operation=>{
    const f=fixture(operation),before=localBytes(cwd);vi.mocked(tty.confirmWrite).mockRejectedValueOnce(Object.assign(new Error('cancel'),{code:'FORM_CANCELLED'}));
    await expect(f.run()).rejects.toMatchObject({code:'FORM_CANCELLED'});expect(f.write).not.toHaveBeenCalled();expect(f.state.rows).toEqual(initial());expect(localBytes(cwd)).toEqual(before);
  });
  it('move must be adjacent, not merely on the requested side',async()=>{
    const f=fixture('move');f.mutateResult(rows=>[rows[0]!,rows[1]!,rows[3]!,rows[2]!].map((r,i)=>({...r,sortId:i+1})));
    await expect(f.run()).rejects.toMatchObject(unknown);
  });
  it('partial remove reports exact removed and retained IDs instead of all-success',async()=>{
    const f=fixture('remove');f.mutateResult(()=>initial().filter(r=>r.itemId!=='b'));
    await expect(f.run()).rejects.toMatchObject({code:'COLLECTION_ITEM_RESULT_UNKNOWN',message:expect.stringContaining('已移除：b；仍存在：d')});expect(f.write).toHaveBeenCalledTimes(1);
  });
  it.each(['rename','remove','move'] as const)('%s rejects unsafe ID before target lookup',async operation=>{
    const f=fixture(operation);await expect(f.run(operation==='remove'?{itemIds:['b','bad\n']}:{itemId:'bad\n'})).rejects.toMatchObject({code:'COLLECTION_ITEM_ID_INVALID'});
    expect(f.reads).toEqual([]);expect(f.write).not.toHaveBeenCalled();
  });
  it('sort rejects non-increasing final manual sort IDs',async()=>{
    const f=fixture('sort');f.mutateResult(rows=>rows.map(r=>({...r,sortId:1})));await expect(f.run()).rejects.toMatchObject(unknown);
  });
  for(const [by,sortField]of [['added','createDate'],['title','itemTitle'],['resource-updated','resourceUpdateDate']] as const)
    it.each(['asc','desc'] as const)(`sort ${by} %s sends only the platform-supported field/direction`,async direction=>{
      const f=fixture('sort');await f.run({by,direction});expect(f.writes).toEqual([{resourceId:'collection_1',sortField,sortType:direction==='asc'?1:-1}]);
    });
});
