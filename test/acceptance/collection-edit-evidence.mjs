/** C02 source-fixed stimuli and independent catalogue/request oracles. No CLI domain imports. */
import {isDeepStrictEqual as equal} from 'node:util';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {itemHash,itemInitialEntries} from './collection-items-evidence.mjs';
export {itemHash as editHash,itemInitialEntries as editInitialEntries};
export const editNames=Object.freeze(['list-101','search','rename','remove','move-before','move-after',
  ...['added','title','resource-updated'].flatMap(by=>['asc','desc'].map(dir=>`sort-${by}-${dir}`)),
  ...['rename','remove','move','sort'].map(op=>`bad-ack-${op}`),'rename-other-change','remove-partial','move-not-adjacent','sort-extra-item',
  ...['rename','remove','move','sort'].map(op=>`race-${op}`),'disconnect-rename','bad-page-remove','no-yes-sort','missing-item-move','unsafe-id-rename','move-page-anchor']);
const design='docs/一期/产品方案/脚手架设计/PHASE/合集';
export const collectionEditCases=Object.freeze([{id:'COLLECTION.EDIT.INSTALLED_MATRIX',kind:'product-case',required:true,parentRule:'COLLECTION.MANAGEMENT_MATRIX',
  title:'Installed catalogue editing, six reorder mappings and exact result/concurrency boundaries',script:'verify-collection-edit.mjs',
  assertionIds:['installed-edit-binding',...editNames.map(n=>`edit-${n}`)],layer:'installed-candidate/local-loopback/not-real-dev/not-TTY',
  inputClass:'C02.E01–E09, 30 fixed complete-catalogue scenarios',
  designRefs:[{path:`${design}/单品/03-编辑移除排序与授权状态.md`,sections:['1','2','3','5']},{path:`${design}/测试/00-功能拓扑与证据驱动测试门禁.md`,sections:['8.13']}],
  scenarioRules:editNames.map(scenario=>({scenario,ruleId:scenario.startsWith('sort-')?'C02.E05':scenario.startsWith('race-')?'C02.E07'
    :scenario.startsWith('bad-ack-')?'C02.E06':scenario.includes('disconnect')||scenario.includes('bad-page')?'C02.E09'
      :scenario==='search'||scenario==='list-101'?'C02.E01':scenario.includes('no-yes')||scenario.includes('missing-item')||scenario.includes('unsafe-id')?'C02.E08'
        :scenario.includes('rename')?'C02.E02':scenario.includes('remove')?'C02.E03':'C02.E04'})),
  preconditions:['Installed candidate and SDK; exact synthetic owner; isolated child environment and local transport.'],
  action:['Run every fixed argv, retain raw requests/responses, compare complete local and remote state.'],
  forbiddenSideEffects:['real network','native keyring','signing/payment','publication','automatic retry','workspace bin fallback']}]);
export const editTarget={resourceId:'local_collection',resourceName:'alice/collection',resourceTypeCode:'CT001',subjectType:4,userId:7,status:0};
export const editRules={ret:0,errCode:0,data:{status:0,serializeStatus:0,conditionType:1,filterConditions:[]}};
export const editPath='/v2/resources/catalogues/drafts/local_collection';
export const editOk=data=>({ret:0,errCode:0,data});
const indexId=i=>`item_${String(i).padStart(3,'0')}`;
export function editRows(name){const rows=['a','b','c','d'].map((id,i)=>({itemId:`item_${id}`,itemTitle:['D','B','A','C'][i],sortId:i+1,mountResourceInfo:{resourceId:`source_${id}`}}));
  if(name==='list-101'||name==='move-page-anchor')for(let i=4;i<101;i++)rows.push({itemId:indexId(i),itemTitle:`Title ${i}`,sortId:i+1,mountResourceInfo:{resourceId:`source_${i}`}});return rows;}
export function editOperation(name){if(name==='list-101'||name==='search')return 'list';if(name.includes('rename'))return 'rename';if(name.includes('remove'))return 'remove';if(name.includes('move'))return 'move';return 'sort';}
export function editCommand(name){const op=editOperation(name);let args=['collection','item',op];
  if(op==='rename')args.push(name==='unsafe-id-rename'?'bad\n':'item_b','--title',' new ');
  if(op==='remove')args.push('item_b','item_d','item_b');
  if(op==='move')args.push(name==='move-page-anchor'?indexId(100):name==='move-after'?'item_a':name==='missing-item-move'?'item_missing':'item_d',
    name==='move-after'?'--after':'--before',name==='move-page-anchor'?'item_a':name==='move-after'?'item_c':'item_b');
  if(op==='sort'){const by=/^sort-(added|title|resource-updated)-(asc|desc)$/u.test(name)?name.slice(5,name.lastIndexOf('-')):'title';args.push('--by',by,name.endsWith('-desc')?'--desc':'--asc');}
  if(name==='search')args.push('--search',' needle ');
  args.push('--resource','id:local_collection','--env','dev','--json');if(name!=='no-yes-sort')args.push('--yes');return args;}
export function editWrites(name){return !['list-101','search','no-yes-sort','missing-item-move','unsafe-id-rename'].includes(name)&&!name.startsWith('race-');}
export function editPayload(name){const op=editOperation(name);
  if(op==='rename')return {method:'PUT',path:`${editPath}/items`,body:[{itemId:'item_b',itemTitle:'new'}]};
  if(op==='remove')return {method:'DELETE',path:`${editPath}/items?removeCollectionItemIds=item_b%2Citem_d`,body:null};
  if(op==='move')return {method:'PUT',path:`${editPath}/manualSort`,body:{itemIds:[name==='move-page-anchor'?indexId(100):name==='move-after'?'item_a':'item_d'],targetSortId:name==='move-page-anchor'?1:name==='move-after'?3:2}};
  const command=editCommand(name),by=command[command.indexOf('--by')+1];
  return {method:'PUT',path:`${editPath}/reorder`,body:{sortField:{added:'createDate',title:'itemTitle','resource-updated':'resourceUpdateDate'}[by],sortType:command.includes('--desc')?-1:1}};
}
// Literal expected orders are independent of the local server's ordering calculation.
const sortOrders={added:['c','a','d','b'],title:['c','b','d','a'],'resource-updated':['b','d','c','a']};
export function editFinalRows(name){let rows=editRows(name);if(name.startsWith('race-')){rows[0].itemTitle='concurrent';return rows;}
  if(!editWrites(name))return rows;const op=editOperation(name);
  if(op==='rename')rows[1].itemTitle='new';
  if(op==='remove')rows=rows.filter(r=>!['item_b',...(name==='remove-partial'?[]:['item_d'])].includes(r.itemId));
  if(op==='move'){const moving=name==='move-page-anchor'?indexId(100):name==='move-after'?'item_a':'item_d';const entry=rows.find(r=>r.itemId===moving);rows=rows.filter(r=>r.itemId!==moving);
    rows.splice(name==='move-page-anchor'?0:name==='move-after'?2:1,0,entry);if(name==='move-not-adjacent')[rows[2],rows[3]]=[rows[3],rows[2]];}
  if(op==='sort'){const command=editCommand(name),by=command[command.indexOf('--by')+1];const ids=[...sortOrders[by]];if(command.includes('--desc'))ids.reverse();rows=ids.map(id=>rows.find(r=>r.itemId===`item_${id}`));}
  if(name==='rename-other-change')rows[0].itemTitle='unrelated-change';
  if(name==='sort-extra-item')rows.push({itemId:'item_extra',itemTitle:'extra',sortId:5,mountResourceInfo:{resourceId:'source_extra'}});
  return rows.map((r,i)=>({...r,sortId:i+1}));
}
export function editRemote(name,after=false){return {target:structuredClone(editTarget),draft:after?editFinalRows(name):editRows(name),published:editRows(name)};}
export function editPage(rows,skip=0,search=false){const list=search?rows.filter(r=>r.itemId==='item_b'):rows;return editOk({skip,limit:100,totalItem:list.length,dataList:list.slice(skip,skip+100)});}
const unknownMessage='目录草稿写入结果无法确认，请先运行 collection item list 核对，不要直接重发。';
export function editExpectedResult(name){let code,message;
  if(name.startsWith('bad-ack-')||['rename-other-change','remove-partial','move-not-adjacent','sort-extra-item','disconnect-rename','bad-page-remove'].includes(name)){
    code='COLLECTION_ITEM_RESULT_UNKNOWN';message=unknownMessage+(name==='remove-partial'?' 已移除：item_b；仍存在：item_d':'');}
  else if(name.startsWith('race-')){code='COLLECTION_ITEM_CATALOGUE_CHANGED';message='目录草稿在确认期间发生变化，请重新查看后操作，本次未提交。';}
  else if(name==='unsafe-id-rename'){code='COLLECTION_ITEM_ID_INVALID';message='itemId不能为空或包含空白、逗号或控制字符';}
  else if(name==='missing-item-move'){code='COLLECTION_ITEM_NOT_FOUND';message='移动目标或参照 itemId 无效';}
  else if(name==='no-yes-sort'){code='FORM_NEED_YES';message='请加 --yes 确认预览';}
  let stdout='';if(code)stdout=JSON.stringify({code,message})+'\n';else if(['list','move','sort'].includes(editOperation(name))){const rows=name==='search'?editRows(name).filter(r=>r.itemId==='item_b'):editFinalRows(name);stdout=rows.map(r=>`${r.itemId}\t${r.mountResourceInfo.resourceId}\t${r.itemTitle}\t`).join('\n')+'\n';}
  return {status:code?1:0,signal:null,error:null,timedOut:false,stdout,stderr:''};}
export function editExpectedRequests(name){if(name==='unsafe-id-rename')return [];const result=[];
  const get=(p,query,response)=>result.push({method:'GET',path:p+(Object.keys(query).length?'?'+new URLSearchParams(query):''),body:null,response});
  const target=()=>get('/v2/resources/local_collection',{isLoadLatestVersionInfo:'1',isLoadPolicyInfo:'1'},editOk(editTarget));
  const rules=()=>get('/v2/resources/catalogue/local_collection/items/collectRules',{},editRules);
  const pages=(rows,search=false,bad=false)=>{for(let skip=0;skip<Math.max(1,rows.length);skip+=100){get(`${editPath}/items`,{skip:String(skip),limit:'100',sortField:'sortId',sortType:'1',isLoadLatestVersionInfo:'1',...(search?{keywords:'needle'}:{})},bad?{ret:1,errCode:0,data:null}:editPage(rows,skip,search));if(search||bad)break;}};
  target();if(editOperation(name)==='list'){pages(editRows(name),name==='search');return result;}
  rules();target();pages(editRows(name));if(['no-yes-sort','missing-item-move'].includes(name))return result;
  target();rules();target();pages(name.startsWith('race-')?editFinalRows(name):editRows(name));if(name.startsWith('race-'))return result;
  result.push({...editPayload(name),response:name==='disconnect-rename'?{disconnected:true}:name.startsWith('bad-ack-')?{ret:1,errCode:0,data:null}:editOk(null)});
  if(name==='disconnect-rename'||name.startsWith('bad-ack-'))return result;target();pages(editFinalRows(name),false,name==='bad-page-remove');return result;}
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const absolute=v=>typeof v==='string'&&path.isAbsolute(v)&&path.resolve(v)===v;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const normalize=({method,path:p,body,response})=>{check(typeof p==='string'&&p.startsWith('/')&&!p.startsWith('//'),'Invalid edit path.');const u=new URL(p,'https://api.devfreelog.com');check(u.origin==='https://api.devfreelog.com'&&!u.hash,'Invalid edit origin.');return{method,path:u.pathname,query:[...u.searchParams].sort(([a],[b])=>a.localeCompare(b)),body,response};};
export function evaluateCollectionEdits(observed){const assertions=[],add=(id,fn)=>{try{fn();assertions.push({id,passed:true,expected:true,actual:true});}catch(e){assertions.push({id,passed:false,expected:true,actual:false,reason:e.message});}};
  add('installed-edit-binding',()=>check(observed&&/^[A-Za-z0-9-]{1,80}$/u.test(observed.runId??'')&&absolute(observed.evidenceDir)&&absolute(observed.cliBin)
    &&observed.cliBin.endsWith(path.join('node_modules','@freelog-cli','cli2','dist','bin','index.js'))&&observed.packageName==='@freelog-cli/cli2'&&typeof observed.version==='string'&&observed.version.length>0
    &&/^[a-f0-9]{64}$/u.test(observed.binSha256??'')&&['win32','darwin','linux'].includes(observed.platform)&&/^v(20|22)\./u.test(observed.nodeVersion??'')
    &&iso(observed.startedAt)&&iso(observed.finishedAt)&&Date.parse(observed.startedAt)<=Date.parse(observed.finishedAt)&&Date.parse(observed.finishedAt)<=Date.now()
    &&equal(observed.apparatusErrors,[])&&equal(observed.scenarios?.map(s=>s.name),editNames),'Installed edit run binding differs.'));
  for(const [i,name]of editNames.entries())add(`edit-${name}`,()=>{const s=observed?.scenarios?.[i];check(s&&s.name===name&&equal(s.argv,editCommand(name)),'Fixed edit argv missing.');
    check(iso(s.startedAt)&&iso(s.finishedAt)&&Date.parse(observed.startedAt)<=Date.parse(s.startedAt)&&Date.parse(s.startedAt)<=Date.parse(s.finishedAt)&&Date.parse(s.finishedAt)<=Date.parse(observed.finishedAt)
      &&Number.isSafeInteger(s.childPid)&&s.childPid>0,'Actual edit process/window missing.');
    check(equal(s.result,editExpectedResult(name)),'Exact edit exit/JSON/stdout differs.');
    check(equal(s.before,itemInitialEntries())&&equal(s.after,s.before),'Complete local bytes changed.');
    check(equal(s.remoteBefore,editRemote(name))&&equal(s.remoteAfter,editRemote(name,true)),'Full remote edit state differs.');
    check(equal(s.requests.map(normalize),editExpectedRequests(name).map(normalize))&&equal(s.apparatusErrors,[]),'Exact edit SDK request/response differs.');
    const trace=s.trace.trim().split('\n').map(JSON.parse);check(trace.every(e=>e.schemaVersion===1&&['keyring-replaced','keyring-get','ready','finished','request'].includes(e.event))
      &&trace.filter(e=>e.event==='ready'&&e.guard==='collection-edit-local-v1').length===1&&trace.at(-1).event==='finished'
      &&equal(trace.filter(e=>e.event==='request').map(({method,path})=>({method,path})),s.requests.map(({method,path})=>({method,path}))),'Edit transport trace missing/blocked.');});
  const status=assertions.every(a=>a.passed)?'PASS':'FAIL';return{id:collectionEditCases[0].id,status,assertions,observations:observed,...(status==='FAIL'?{reason:assertions.filter(a=>!a.passed).map(a=>`${a.id}: ${a.reason}`).join('; ')}:{})};}
export function validateCollectionEditFiles(observed){check(absolute(observed?.evidenceDir),'Missing edit raw root.');const seen=new Set();
  for(const stage of observed.scenarios){const {evidenceRef,...raw}=stage,file=evidenceRef?.path,relative=typeof file==='string'?path.relative(observed.evidenceDir,file):'';
    check(absolute(file)&&relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)&&!seen.has(file)&&lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()&&realpathSync(file)===file&&lstatSync(file).size<=2_000_000,'Missing/unsafe edit raw file.');
    seen.add(file);const bytes=readFileSync(file);check(itemHash(bytes)===evidenceRef.sha256&&equal(JSON.parse(bytes.toString('utf8')),raw),'Edit raw hash/content differs.');}
  check(seen.size===editNames.length,'Missing edit raw scene.');}
