/** C01 source-fixed inputs and independent semantic oracle; no CLI implementation imports. */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as equal, stripVTControlCharacters } from 'node:util';
import { itemInitialEntries, itemHash } from './collection-items-evidence.mjs';

export const identityNames = Object.freeze(['create-code','create-hierarchy','create-search','create-input','create-decline','create-cancel',
  'type-failed','lookup-failed','lookup-own-shell','create-untrusted','create-disconnect','create-local-failure',
  'bind-id','bind-name','bind-repeat','bind-env','bind-name-conflict','target-id','target-name','target-file','target-unique',
  'target-pagination','target-multiple','target-cancel','target-empty','target-badpage','target-required-empty','target-required-multiple',
  'target-owner','target-subject','target-frozen-write','auth-required-create','auth-required-read']);
export const collectionIdentityCases = Object.freeze([Object.freeze({ id: 'COLLECTION.IDENTITY.INSTALLED_MATRIX', required: true, kind: 'product-case',
  parentRule: 'COLLECTION.MANAGEMENT_MATRIX', script: 'verify-collection-identity.mjs', title: 'Installed C01 identity creation, binding and real terminal target selection',
  assertionIds: Object.freeze(['installed-identity-binding', ...identityNames.map((name) => `identity-${name}`)]),
  scenarioRules: Object.freeze(identityNames.map((scenario, i) => Object.freeze({ scenario, ruleId: `C01.A${String(i + 1).padStart(2, '0')}` }))),
  layer: 'installed-candidate/mixed-real-node-pty/local-loopback/not-real-dev', inputClass: '33 fixed C01.A identity scenarios',
  preconditions: ['Exact installed candidate, owned workspaces, synthetic dev credential and isolated native PTY capability.'],
  action: ['Execute fixed argv/keys; recompute full SDK, local bytes, model state and safe outcome.'],
  forbiddenSideEffects: ['real network', 'native credentials', 'signing/payment', 'publication', 'automatic create replay', 'workspace fallback'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/创建/01-Step1-创建合集.md', section: '0–4' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/README.md', section: '目标选择' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', section: '8.14' }],
})]);
export const identityHash = itemHash;
export const identityOk = (data) => ({ ret: 0, errCode: 0, data });
export const identityCopy = (v) => structuredClone(v);
export const identityJson = (v) => `${JSON.stringify(v, null, 2)}\n`;
const bytes = (text) => Buffer.from(text).toString('base64');
export const identityTypes = [{ code: 'ROOT', name: '祖父', status: 1, subjectType: [1], children: [
  { code: 'PARENT', name: '父', status: 1, subjectType: [1], children: [
    { code: 'CT001', name: '叶子', status: 1, subjectType: [4], children: [] },
  ] },
] }];
export const identityTypeInfo = { code: 'CT001', name: '叶子', status: 1, subjectType: [4], isTerminate: true };
export const identityCreated = { resourceId: 'created_collection', resourceName: 'alice/new_collection', resourceTitle: '新合集',
  resourceTypeCode: 'CT001', subjectType: 4, userId: 7, status: 0, latestVersion: '', serializeStatus: 0 };
export const identityCreateBody = { name: 'new_collection', resourceTitle: '新合集', resourceTypeCode: 'CT001', subjectType: 4 };
export const identityRules = { status: 0, conditionType: 1, filterConditions: [], serializeStatus: 0 };
export const identityTtyNames = new Set(['create-hierarchy','create-search','create-input','create-decline','create-cancel',
  'target-pagination','target-multiple','target-cancel','target-empty','target-badpage']);
const createdNames = new Set(['create-code','create-hierarchy','create-search','create-input','create-untrusted','create-disconnect','create-local-failure']);
const sorted = (rows) => rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
export function identityTarget(id = 'local_collection', name = 'alice/collection') {
  return { resourceId: id, resourceName: name, resourceTitle: '线上合集', resourceTypeCode: 'CT001', subjectType: 4, userId: 7, status: 0, latestVersion: '', serializeStatus: 0 };
}
export function identityModel(name, after = false) {
  const create = name.startsWith('create-') || ['type-failed','lookup-failed','lookup-own-shell','auth-required-create'].includes(name);
  let resources = create ? [] : [identityTarget()];
  if (name === 'lookup-own-shell') resources = [identityTarget('existing_collection', 'alice/new_collection')];
  if (['target-pagination','target-multiple','target-cancel','target-empty','target-badpage'].includes(name)) {
    const count = name === 'target-pagination' ? 101 : name === 'target-empty' ? 0 : 3;
    resources = Array.from({ length: count }, (_, i) => ({ ...identityTarget(`owned_${String(i).padStart(3, '0')}`, `alice/owned_${String(i).padStart(3, '0')}`), resourceTitle: '标题可重复' }));
  }
  if (name === 'target-owner') resources[0].userId = 8;
  if (name === 'target-subject') resources[0].subjectType = 1;
  if (name === 'target-frozen-write') resources[0].status = 2;
  if (after && createdNames.has(name)) resources.push(identityCopy(identityCreated));
  return { resources, creations: after && createdNames.has(name) ? 1 : 0 };
}
function stored(resource, title = '旧缓存标题', env = 'dev') {
  return { schemaVersion: 1, subject: 'collection', resourceId: resource.resourceId, resourceName: resource.resourceName,
    name: resource.resourceName.split('/')[1], title, typeCode: 'CT001', env };
}
export function identityInitialEntries(name) {
  if (!identityNames.includes(name)) throw new Error('Unknown fixed C01 scene.');
  const entries = itemInitialEntries().filter((row) => row.path !== '.freelog/1.json' && (!name.startsWith('auth-required-') || row.path !== '.freelog/auth'));
  const one = ['bind-repeat','bind-env','bind-name-conflict','target-file','target-unique'].includes(name);
  if (one) {
    const target = name === 'bind-name-conflict' ? identityTarget('other_collection') : identityTarget();
    entries.push({ path: '.freelog/1.json', kind: 'file', bytes: bytes(identityJson(stored(target, '旧缓存标题', name === 'bind-env' ? 'test' : 'dev'))) });
  }
  if (['target-multiple','target-required-multiple'].includes(name)) {
    for (let i = 0; i < 2; i++) entries.push({ path: `.freelog/${i + 1}.json`, kind: 'file',
      bytes: bytes(identityJson(stored(identityTarget(`owned_00${i}`, `alice/owned_00${i}`)))) });
    entries.find((row) => row.path === '.freelog/.sequence').bytes = bytes('2\n');
  }
  return sorted(entries);
}
export function identityStageCount(name) { return name === 'create-local-failure' ? 2 : 1; }
export function identityError(name, stage = 0) {
  if (stage === 1) return undefined;
  const values = {
    'create-decline': ['FORM_CANCELLED','已取消'], 'create-cancel': ['COLLECTION_TYPE_CANCELLED','已取消合集类型选择'],
    'type-failed': ['COLLECTION_TYPE_RESPONSE_INVALID','平台合集类型查询失败或响应不完整，请核对后重试'],
    'lookup-failed': ['COLLECTION_LOOKUP_FAILED','查询现有合集失败，请检查登录和网络后重试'],
    'lookup-own-shell': ['COLLECTION_OWN_SHELL','这个合集授权标识已经存在，请使用 collection bind 接入'],
    'bind-env': ['COLLECTION_ENV_MISMATCH','同一合集不能跨环境复用本地身份'],
    'bind-name-conflict': ['COLLECTION_NAME_BOUND','合集标识已绑定到 1.json'],
    'target-cancel': ['COLLECTION_SELECTION_CANCELLED','已取消选择合集'],
    'target-empty': ['COLLECTION_LIST_EMPTY','当前账号没有线上合集，请先 collection create'],
    'target-badpage': ['COLLECTION_LIST_INVALID','平台合集分页不完整或列表已变化，请重新选择'],
    'target-required-empty': ['COLLECTION_SELECTOR_REQUIRED','非交互调用请用 --resource id:、完整 name: 或 file:N.json 指定合集'],
    'target-required-multiple': ['COLLECTION_SELECTOR_REQUIRED','非交互调用请用 --resource id:、完整 name: 或 file:N.json 指定合集'],
    'target-owner': ['COLLECTION_NOT_OWNER','只能管理当前账号的合集'], 'target-subject': ['COLLECTION_TARGET_INVALID','目标不是可维护的合集'],
    'target-frozen-write': ['COLLECTION_FROZEN','冻结合集不能修改上下架状态'],
    'auth-required-create': ['AUTH_REQUIRED','请先 login'], 'auth-required-read': ['AUTH_REQUIRED','请先 login'],
  };
  if (['create-untrusted','create-disconnect'].includes(name)) return { code: 'COLLECTION_CREATE_RESULT_UNKNOWN',
    message: '无法确认合集 alice/new_collection 是否已创建；请勿重复创建，请按完整授权标识只读核对后使用 collection bind 接入。' };
  if (name === 'create-local-failure') return { code: 'COLLECTION_CREATE_LOCAL_STATE_FAILED',
    message: '合集 alice/new_collection（ID：created_collection）已创建，但本地身份保存失败；请保留现场，勿重复创建，处理本地故障后使用 collection bind id:created_collection 接入。' };
  const value = values[name]; return value ? { code: value[0], message: value[1] } : undefined;
}
export function identityCommand(name, stage = 0) {
  if (stage === 1) return ['collection','bind','id:created_collection','--env','dev'];
  const create = name.startsWith('create-') || ['type-failed','lookup-failed','lookup-own-shell','auth-required-create'].includes(name);
  let args;
  if (create) args = ['collection','create','--title','新合集','--name','new_collection',
    ...(['create-hierarchy','create-search','create-input','create-cancel'].includes(name) ? [] : ['--type','CT001']),
    ...(['create-hierarchy','create-search','create-input','create-decline','create-cancel'].includes(name) ? [] : ['--yes'])];
  else if (name.startsWith('bind-')) args = ['collection','bind',name === 'bind-name' ? 'name:alice/collection' : 'id:local_collection'];
  else if (name === 'target-frozen-write') args = ['collection','offline','--resource','id:local_collection','--yes'];
  else args = ['collection','collect-rules','get',
    ...(['target-unique','target-pagination','target-multiple','target-cancel','target-empty','target-badpage','target-required-empty','target-required-multiple','auth-required-read'].includes(name) ? []
      : ['--resource',name === 'target-name' ? 'name:alice/collection' : name === 'target-file' ? 'file:1.json' : 'id:local_collection'])];
  return [...args,'--env','dev',...(!identityTtyNames.has(name) && identityError(name) ? ['--json'] : [])];
}
export function identitySteps(name) {
  const enter = '\r', down = (n) => '\u001b[B'.repeat(n), up = (n) => '\u001b[A'.repeat(n);
  const steps = [], add = (expect, send) => steps.push({ expect, ...(send ? { send } : {}) });
  if (name === 'create-hierarchy') {
    add('选择合集类型',enter); add('选择合集类型（祖父）',enter); add('选择合集类型（祖父 / 父）',enter);
  } else if (name === 'create-search') {
    add('选择合集类型',down(1)+enter); add('? 搜索合集类型','leaf'+enter); add('选择搜索结果',enter);
  } else if (name === 'create-input') {
    add('选择合集类型',down(2)+enter); add('输入合集最终叶子类型编号','CT001'+enter);
  } else if (name === 'create-cancel') { add('选择合集类型',up(1)+enter); add(identityError(name).message); return steps; }
  if (['create-hierarchy','create-search','create-input','create-decline'].includes(name)) {
    add('确认写入？',name === 'create-decline' ? 'n'+enter : enter);
    add(name === 'create-decline' ? '已取消' : 'created_collection');
  } else if (name === 'target-pagination') {
    add('选择本人合集（第1/2页）',up(2)+enter); add('选择本人合集（第2/2页）',down(1)+enter);
    add('选择本人合集（第1/2页）',up(2)+enter); add('选择本人合集（第2/2页）',enter); add('"serializeStatus": 0');
  } else if (name === 'target-multiple') { add('选择本人合集（第1/1页）',down(2)+enter); add('"serializeStatus": 0'); }
  else if (name === 'target-cancel') { add('选择本人合集（第1/1页）',up(1)+enter); add(identityError(name).message); }
  else if (['target-empty','target-badpage'].includes(name)) add(identityError(name).message);
  return steps;
}
export function identityCapabilityCommand() { return ['--input-type=module','-e','console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY}));process.exit(0);']; }
export function identityLocalAfter(name, stage = 0) {
  const entries = identityInitialEntries(name);
  if (name === 'create-local-failure' && stage === 0) entries.find((row) => row.path === '.freelog/.sequence').bytes = bytes('broken-sequence\n');
  const newIdentity = ['create-code','create-hierarchy','create-search','create-input'].includes(name) || name === 'create-local-failure' && stage === 1
    ? stored(identityCreated, '新合集') : ['bind-id','bind-name'].includes(name) ? stored(identityTarget(), '线上合集') : undefined;
  if (newIdentity) {
    entries.push({ path: '.freelog/2.json', kind: 'file', bytes: bytes(identityJson(newIdentity)) });
    entries.find((row) => row.path === '.freelog/.sequence').bytes = bytes('2\n');
  }
  return sorted(entries);
}
export function identityExpectedRequests(name, stage = 0) {
  const out = [], get = (p, query, response) => out.push({ method: 'GET', path: p + (Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''), body: null, response: identityCopy(response) });
  const info = (key, resource) => get(`/v2/resources/${encodeURIComponent(key)}`, { isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }, identityOk(resource));
  if (stage === 1) { info('created_collection',identityCreated); return out; }
  if (['bind-env','target-required-empty','target-required-multiple','auth-required-create','auth-required-read'].includes(name)) return out;
  const create = name.startsWith('create-') || ['type-failed','lookup-failed','lookup-own-shell'].includes(name);
  if (create) {
    const tree = () => get('/v2/resources/types/listSimpleByGroup',{category:1,status:1,subjectType:4},name === 'type-failed' ? {ret:1,errCode:0,data:identityTypes} : identityOk(identityTypes));
    if (['create-hierarchy','create-search','create-input','create-cancel'].includes(name)) tree();
    if (name === 'create-cancel') return out;
    if (name === 'create-search') { tree(); get('/v2/resources/types/listSimpleByParentCode',{category:1,nameChain:'leaf',isTerminate:true,status:1,subjectType:4},identityOk([{code:'CT001',name:'伪叶子',names:'伪祖先'}])); }
    tree(); get('/v2/resources/types/getInfoByCode',{code:'CT001'},identityOk(identityTypeInfo));
    if (name === 'type-failed') return out;
    get('/v2/resources/alice%2Fnew_collection',{isLoadLatestVersionInfo:1},name === 'lookup-failed' ? {ret:1,errCode:0,data:null}
      : identityOk(name === 'lookup-own-shell' ? identityModel(name).resources[0] : null));
    if (['lookup-failed','lookup-own-shell','create-decline'].includes(name)) return out;
    out.push({method:'POST',path:'/v2/resources',body:identityCopy(identityCreateBody),response:name === 'create-disconnect' ? {disconnected:true}
      : identityOk({resourceId:'created_collection',resourceName:name === 'create-untrusted' ? 'alice/wrong' : identityCreated.resourceName,resourceTypeCode:'CT001'})});
    return out;
  }
  const model = identityModel(name);
  if (['target-pagination','target-multiple','target-cancel','target-empty','target-badpage'].includes(name)) {
    for (const skip of name === 'target-pagination' ? [0,100] : [0]) {
      const rows = model.resources.slice(skip,skip+100);
      get('/v2/resources',{skip,limit:100,isSelf:1,subjectType:4},identityOk({skip,limit:100,totalItem:model.resources.length,dataList:name === 'target-badpage' ? rows.slice(0,1) : rows}));
    }
    if (['target-cancel','target-empty','target-badpage'].includes(name)) return out;
  }
  const resource = name === 'target-pagination' ? model.resources[100] : name === 'target-multiple' ? model.resources[2] : model.resources[0];
  info(name === 'bind-name' || name === 'target-name' ? 'alice/collection' : resource.resourceId,resource);
  if (name.startsWith('bind-') || ['target-owner','target-subject','target-frozen-write'].includes(name)) return out;
  get(`/v2/resources/catalogue/${resource.resourceId}/items/collectRules`,{},identityOk(null));
  return out;
}
const check = (value,message) => { if (!value) throw new Error(message); };
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
export const identityText = (v) => stripVTControlCharacters(v).replace(/\r/g,'');
function requests(rows) {
  const result = rows.map(({method,path:p,body,response}) => { const u = new URL(p,'https://api.devfreelog.com');
    check(u.origin === 'https://api.devfreelog.com' && !u.hash,'Unexpected request origin.');
    return {method,path:u.pathname,query:[...u.searchParams].sort(([a],[b])=>a.localeCompare(b)),body,response}; });
  // Concurrent tree/detail reads have no ordering relation; all other phases remain ordered.
  for (let start=0;start<result.length;) {
    if (!/^\/v2\/resources\/types\/(listSimpleByGroup|getInfoByCode)$/u.test(result[start].path)) {start++;continue;}
    let end=start+1;while(end<result.length&&/^\/v2\/resources\/types\/(listSimpleByGroup|getInfoByCode)$/u.test(result[end].path))end++;
    result.splice(start,end-start,...result.slice(start,end).sort((a,b)=>a.path.localeCompare(b.path)));start=end;
  }
  return result;
}
function stageCheck(o,name,index,run) {
  const tty = identityTtyNames.has(name) && index === 0, error = identityError(name,index);
  check(o?.index === index && o.tty === tty && equal(o.argv,identityCommand(name,index)) && equal(o.steps,tty ? identitySteps(name) : []),'Fixed command/TTY/keys differ.');
  check(Number.isSafeInteger(o.childPid)&&o.childPid>0&&iso(o.startedAt)&&iso(o.finishedAt)&&Date.parse(run.startedAt)<=Date.parse(o.startedAt)
    &&Date.parse(o.startedAt)<=Date.parse(o.finishedAt)&&Date.parse(o.finishedAt)<=Date.parse(run.finishedAt),'Missing actual child/window.');
  const r=o.result;
  check(r&&r.status===(error?1:0)&&r.signal===null&&typeof r.stdout==='string'&&r.stderr===''&&Buffer.byteLength(r.stdout)<=1_000_000
    &&(tty?r.completed===true&&r.completedSteps===o.steps.length&&equal(r.matchedPrompts,o.steps.map(s=>s.expect)):r.error===null&&r.timedOut===false),'Incomplete or wrong process result.');
  const output=identityText(r.stdout).trimEnd();
  if(error) check(tty?output.replace(/\n/g,'').endsWith(error.message):equal(JSON.parse(output),error),'Wrong exact controlled error.');
  else if(name.startsWith('create-')&&index===0) check(tty?output.replace(/\n/g,'').endsWith('created_collection'):output==='created_collection','Wrong created ID output.');
  else if(name.startsWith('bind-')||index===1) check(output===(name==='bind-repeat'?'1.json':'2.json'),'Wrong binding number.');
  else check(tty?output.replace(/\n/g,'').endsWith(JSON.stringify(identityRules,null,2).replace(/\n/g,'')):equal(JSON.parse(output),identityRules),'Wrong complete target/rules output.');
  for(const step of o.steps)check(identityText(r.stdout).includes(step.expect),'Prompt missing from retained raw terminal.');
  if(['create-hierarchy','create-search','create-input'].includes(name))check(output.includes('祖父 / 父 / 叶子'),'Full type ancestors absent.');
  const before=identityInitialEntries(name);
  check(equal(o.before,before)&&equal(o.after,identityLocalAfter(name,index))&&equal(o.homeBefore,[])&&equal(o.homeAfter,[]),'Unexpected complete local/home byte effect.');
  check(equal(o.remoteBefore,identityModel(name,index===1))&&equal(o.remoteAfter,identityModel(name,true)),'Unexpected exact platform model effect.');
  check(equal(requests(o.requests),requests(identityExpectedRequests(name,index)))&&equal(o.apparatusErrors,[]),'Wrong exact SDK matrix or apparatus error.');
  const trace=o.trace.trim().split('\n').map(JSON.parse);
  check(trace.every(e=>e.schemaVersion===1&&['keyring-replaced','keyring-get','ready','request','finished'].includes(e.event))
    &&trace.filter(e=>e.event==='ready'&&e.guard==='collection-identity-local-v1').length===1&&trace.at(-1).event==='finished'
    &&equal(trace.filter(e=>e.event==='request').map(({method,path})=>({method,path})),o.requests.map(({method,path})=>({method,path}))),'Missing or unapproved isolation trace.');
}
export function evaluateCollectionIdentity(observed) {
  const assertions=[],add=(id,fn)=>{try{fn();assertions.push({id,passed:true,expected:true,actual:true});}catch(error){assertions.push({id,passed:false,expected:true,actual:false,reason:error.message});}};
  add('installed-identity-binding',()=>{
    check(observed&&/^[A-Za-z0-9-]{1,80}$/u.test(observed.runId??'')&&absolute(observed.evidenceDir)&&absolute(observed.cliBin)
      &&observed.cliBin.endsWith(path.join('node_modules','@freelog-cli','cli2','dist','bin','index.js'))&&observed.packageName==='@freelog-cli/cli2'
      &&typeof observed.version==='string'&&/^[a-f0-9]{64}$/u.test(observed.binSha256??'')&&['win32','darwin','linux'].includes(observed.platform)
      &&/^v(20|22)\./u.test(observed.nodeVersion??'')&&iso(observed.startedAt)&&iso(observed.finishedAt)&&Date.parse(observed.startedAt)<=Date.parse(observed.finishedAt)
      &&Date.parse(observed.finishedAt)<=Date.now()&&equal(observed.apparatusErrors,[])&&equal(observed.scenarios?.map(s=>s.name),identityNames),'Installed run binding differs.');
    const c=observed.capability;
    check(c&&Number.isSafeInteger(c.childPid)&&c.childPid>0&&equal(c.argv,identityCapabilityCommand())&&c.result?.completed===true&&c.result.status===0&&c.result.signal===null&&c.result.stderr===''
      &&identityText(c.result.stdout).trim()==='{"stdin":true,"stdout":true}'&&c.result.completedSteps===1&&equal(c.result.matchedPrompts,['{"stdin":true,"stdout":true}'])
      &&absolute(c.cwd)&&absolute(c.controls)&&iso(c.startedAt)&&iso(c.finishedAt)&&Date.parse(observed.startedAt)<=Date.parse(c.startedAt)
      &&Date.parse(c.startedAt)<=Date.parse(c.finishedAt)&&Date.parse(c.finishedAt)<=Date.parse(observed.finishedAt)
      &&equal(c.before,identityInitialEntries('create-cancel'))&&equal(c.after,c.before)&&equal(c.homeBefore,[])&&equal(c.homeAfter,[]),'Missing exact native capability.');
    const events=c.trace.trim().split('\n').map(JSON.parse);
    check(events.every(e=>e.schemaVersion===1&&['keyring-replaced','ready','finished'].includes(e.event))
      &&events.filter(e=>e.event==='ready'&&e.guard==='collection-identity-local-v1').length===1&&events.at(-1).event==='finished','Capability isolation differs.');
    let end=Date.parse(c.finishedAt);
    for(const scene of observed.scenarios)for(const stage of scene.stages??[]){
      check(iso(stage.startedAt)&&iso(stage.finishedAt)&&Date.parse(stage.startedAt)>=end,'Sequential identity stages overlap or predate native capability.');
      end=Date.parse(stage.finishedAt);
    }
  });
  for(const [i,name] of identityNames.entries())add(`identity-${name}`,()=>{
    const scene=observed?.scenarios?.[i];
    check(scene?.name===name&&!scene.apparatusError&&absolute(scene.cwd)&&absolute(scene.controls)&&scene.stages?.length===identityStageCount(name),'Missing or wrong scene.');
    for(const [index,stage] of scene.stages.entries())stageCheck(stage,name,index,observed);
    const actions=scene.controlActions;
    if(name!=='create-local-failure')check(equal(actions,[]),'Unexpected parent filesystem action.');
    else {
      check(actions?.length===2&&actions[0].kind==='sequence-fault'&&actions[1].kind==='sequence-repair'
        &&actions.every(a=>a.path==='.freelog/.sequence'&&iso(a.at))&&actions[0].before===bytes('1\n')&&actions[0].after===bytes('broken-sequence\n')
        &&actions[1].before===actions[0].after&&actions[1].after===actions[0].before
        &&Date.parse(scene.stages[0].startedAt)<=Date.parse(actions[0].at)&&Date.parse(actions[0].at)<=Date.parse(scene.stages[0].finishedAt)
        &&Date.parse(scene.stages[0].finishedAt)<=Date.parse(actions[1].at)&&Date.parse(actions[1].at)<=Date.parse(scene.stages[1].startedAt),'Local fault/explicit repair evidence differs.');
    }
  });
  const status=assertions.every(a=>a.passed)?'PASS':'FAIL';
  return{id:collectionIdentityCases[0].id,status,assertions,observations:observed,...(status==='PASS'?{}:{reason:assertions.filter(a=>!a.passed).map(a=>`${a.id}: ${a.reason}`).join('; ')})};
}
export function validateCollectionIdentityFiles(observed) {
  check(absolute(observed?.evidenceDir),'Missing raw identity root.');const seen=new Set();
  for(const item of [observed.capability,...observed.scenarios]){
    const {evidenceRef,...raw}=item,file=evidenceRef?.path,relative=typeof file==='string'?path.relative(observed.evidenceDir,file):'';
    check(absolute(file)&&relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)&&!seen.has(file)
      &&lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()&&realpathSync(file)===file&&lstatSync(file).size<=2_000_000,'Missing or unsafe identity raw file.');
    seen.add(file);const original=readFileSync(file);check(itemHash(original)===evidenceRef.sha256&&equal(JSON.parse(original.toString('utf8')),raw),'Identity raw hash/content differs.');
  }
  check(seen.size===34,'Missing or duplicate identity scene files.');
}
