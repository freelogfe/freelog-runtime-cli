#!/usr/bin/env node
/** Real installed C02 commands, local transport only. Server actions do not copy oracle results. */
import {createServer} from 'node:http';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireInstalledCli} from './verify-command-parameters.mjs';
import {itemWorkspaceSnapshot,itemChildEnvironment,itemChildExecute} from './acceptance/collection-workspace.mjs';
import {cleanupWorkspace} from './acceptance/cleanup.mjs';
import {writeSuiteCases} from './acceptance/protocol.mjs';
import {editRouteAllowed} from './acceptance/collection-edit-control.mjs';
import {editNames,editHash,editInitialEntries,editCommand,editRemote,editPath,editRules,editOk,editPage,evaluateCollectionEdits} from './acceptance/collection-edit-evidence.mjs';
const producer='verify-collection-edit.mjs',id='COLLECTION.EDIT.INSTALLED_MATRIX';
const preload=new URL('./acceptance/collection-edit-preload.mjs',import.meta.url).href;
const clone=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2)+'\n';
async function platform(name){const state=editRemote(name),requests=[],errors=[];let infoReads=0,written=false;
  const server=createServer((req,res)=>{let text='',size=0,deliberate=false;req.setEncoding('utf8');
    req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size<=1_000_000)text+=chunk;else req.destroy();});
    req.on('error',()=>{if(!deliberate)errors.push('Edit request failed before complete observation.');});
    req.on('end',()=>{let body=null;try{if(text)body=JSON.parse(text);}catch{errors.push('Edit body was not JSON.');}
      const entry={method:req.method,path:req.url,body,response:null};requests.push(entry);
      const send=value=>{entry.response=clone(value);const bytes=JSON.stringify(value);res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)});res.end(bytes);};
      if(!editRouteAllowed(req.method,req.url)||req.method==='GET'&&text){errors.push('Unapproved edit route/method/body.');send({ret:1,errCode:77,data:null});return;}
      const u=new URL(req.url,'https://api.devfreelog.com'),p=u.pathname;
      if(req.method==='GET'){
        if(p==='/v2/resources/local_collection'){infoReads++;if(name.startsWith('race-')&&infoReads===3)state.draft[0].itemTitle='concurrent';send(editOk(state.target));return;}
        if(p.endsWith('/collectRules')){send(editRules);return;}
        if(p===`${editPath}/items`){send(written&&name==='bad-page-remove'?{ret:1,errCode:0,data:null}:editPage(state.draft,Number(u.searchParams.get('skip')??0),u.searchParams.has('keywords')));return;}
      }
      if(req.method==='DELETE'){const ids=new Set(u.searchParams.get('removeCollectionItemIds').split(','));
        if(name==='remove-partial')ids.delete('item_d');state.draft=state.draft.filter(r=>!ids.has(r.itemId));}
      else if(p===`${editPath}/items`&&Array.isArray(body)){for(const patch of body){const row=state.draft.find(r=>r.itemId===patch.itemId);if(row)row.itemTitle=patch.itemTitle;}
        if(name==='rename-other-change')state.draft[0].itemTitle='unrelated-change';}
      else if(p===`${editPath}/manualSort`){const moving=state.draft.filter(r=>body.itemIds.includes(r.itemId));state.draft=state.draft.filter(r=>!body.itemIds.includes(r.itemId));state.draft.splice(body.targetSortId-1,0,...moving);
        if(name==='move-not-adjacent')[state.draft[2],state.draft[3]]=[state.draft[3],state.draft[2]];}
      else if(p===`${editPath}/reorder`){const created={item_a:2,item_b:4,item_c:1,item_d:3},updated={item_a:4,item_b:1,item_c:3,item_d:2};
        const key=r=>body.sortField==='itemTitle'?r.itemTitle:(body.sortField==='createDate'?created:updated)[r.itemId];
        state.draft.sort((a,b)=>key(a)<key(b)?-body.sortType:key(a)>key(b)?body.sortType:0);
        if(name==='sort-extra-item')state.draft.push({itemId:'item_extra',itemTitle:'extra',sortId:5,mountResourceInfo:{resourceId:'source_extra'}});}
      else {errors.push('Unrecognized actual edit payload.');send({ret:1,errCode:77,data:null});return;}
      state.draft=state.draft.map((r,i)=>({...r,sortId:i+1}));written=true;
      if(name==='disconnect-rename'){entry.response={disconnected:true};deliberate=true;req.socket.destroy();}
      else send(name.startsWith('bad-ack-')?{ret:1,errCode:0,data:null}:editOk(null));
    });});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return{state,requests,errors,port:server.address().port,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();})};
}
export async function editScenario(name,installed,env,evidenceDir){const cwd=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-work-'))),controls=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls,'home'));for(const entry of editInitialEntries()){const file=path.join(cwd,entry.path);if(entry.kind==='directory')mkdirSync(file,{recursive:true});else{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,Buffer.from(entry.bytes,'base64'));}}
  const trace=path.join(controls,'trace.jsonl'),control=path.join(controls,'control.json'),o={name,cwd,controls,argv:editCommand(name),apparatusErrors:[]};let server;
  try{server=await platform(name);writeFileSync(trace,'',{flag:'wx'});writeFileSync(control,json({cwd,port:server.port,trace,fault:'none'}),{flag:'wx'});
    o.before=itemWorkspaceSnapshot(cwd);o.remoteBefore=clone(server.state);o.startedAt=new Date().toISOString();
    Object.assign(o,await itemChildExecute(installed,o.argv,cwd,itemChildEnvironment(env,controls,control),preload));
    o.finishedAt=new Date().toISOString();o.after=itemWorkspaceSnapshot(cwd);o.remoteAfter=clone(server.state);
    o.requests=clone(server.requests);o.trace=readFileSync(trace,'utf8');o.apparatusErrors=clone(server.errors);
  }catch{o.apparatusErrors.push('Owned edit apparatus failed; retained for diagnosis.');}finally{if(server)await server.close();}
  const file=path.join(evidenceDir,`collection-edit.${name}.json`),bytes=json(o);writeFileSync(file,bytes,{flag:'wx'});o.evidenceRef={path:file,sha256:editHash(bytes)};return o;
}
export async function runCollectionEditCases({env=process.env,output=env.FREELOG_TEST_SUITE_REPORT}={}){const startedAt=new Date().toISOString();
  if(typeof output!=='string'||!path.isAbsolute(output)||existsSync(output))throw new Error('A fresh absolute report is required; existing evidence is never overwritten.');
  const evidenceDir=path.dirname(output);if(realpathSync(evidenceDir)!==evidenceDir||!lstatSync(evidenceDir).isDirectory()||lstatSync(evidenceDir).isSymbolicLink())throw new Error('Edit evidence directory is not canonical.');
  if(!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID??'')||env.FREELOG_TEST_RUN_ID!==process.env.FREELOG_TEST_RUN_ID)throw new Error('Edit run ID differs from writer.');
  let installed;try{installed=requireInstalledCli(env);}catch{const result={id,status:'BLOCKED',reason:'A valid installed candidate is required.',assertions:[],observations:{runId:env.FREELOG_TEST_RUN_ID,startedAt,finishedAt:new Date().toISOString(),executed:false}};writeSuiteCases([result],output);return{cases:[result],exitCode:3};}
  const o={runId:env.FREELOG_TEST_RUN_ID,evidenceDir,...installed,platform:process.platform,nodeVersion:process.version,startedAt,finishedAt:null,scenarios:[],apparatusErrors:[]};
  const deadline=Date.now()+12*60_000;
  for(const name of editNames){if(Date.now()>deadline){o.apparatusErrors.push('Fixed edit deadline exceeded.');break;}
    const scene=await editScenario(name,installed,env,evidenceDir);o.scenarios.push(scene);o.apparatusErrors.push(...scene.apparatusErrors);
    if(scene.result?.error||scene.result?.signal||scene.result?.timedOut){o.apparatusErrors.push('Edit child incomplete; successors not executed.');break;}}
  o.finishedAt=new Date().toISOString();const result=evaluateCollectionEdits(o);writeSuiteCases([result],output);
  if(result.status==='PASS')for(const scene of o.scenarios)try{cleanupWorkspace(scene.cwd,{success:true,prefixes:['freelog-collection-recovery-work-']});cleanupWorkspace(scene.controls,{success:true,prefixes:['freelog-collection-recovery-controls-']});}
    catch{result.status='FAIL';result.reason='Successful edit cleanup failed; remaining owned scenes retained.';break;}
  if(result.status!=='PASS')writeSuiteCases([result],output);return{cases:[result],exitCode:result.status==='PASS'?0:1};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
  const args=process.argv.slice(2).filter(a=>a!=='--skip-build');if(args.length&&(args.length!==2||args[0]!=='--env'||args[1]!=='dev'))throw new Error('Installed collection edit permits only --env dev.');
  const result=await runCollectionEditCases();console.log(JSON.stringify({producer,result:result.cases[0].status}));process.exitCode=result.exitCode;
}catch(error){console.error(error instanceof Error?error.message:'Installed collection edit failed.');process.exitCode=1;}
