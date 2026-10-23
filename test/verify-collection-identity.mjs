#!/usr/bin/env node
/** Installed C01 commands; local model implements requests, never dispatches oracle responses. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemWorkspaceSnapshot, itemChildEnvironment, itemChildExecute } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { identityRouteAllowed } from './acceptance/collection-identity-control.mjs';
import { identityNames, identityTtyNames, identityInitialEntries, identityModel, identityTypes, identityTypeInfo, identityCommand,
  identitySteps, identityStageCount, identityCapabilityCommand, identityHash, identityCopy as copy, identityJson as json,
  identityOk as ok, identityText, evaluateCollectionIdentity } from './acceptance/collection-identity-evidence.mjs';

const producer='verify-collection-identity.mjs',id='COLLECTION.IDENTITY.INSTALLED_MATRIX';
const loader=new URL('./acceptance/collection-recovery-loader.mjs',import.meta.url).href;
const preload=new URL('./acceptance/collection-identity-preload.mjs',import.meta.url).href;
function owned(name) {
  const cwd=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-work-')));
  const controls=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls,'home'));
  for(const entry of identityInitialEntries(name)){
    const file=path.join(cwd,entry.path);
    if(entry.kind==='directory')mkdirSync(file,{recursive:true});else writeFileSync(file,Buffer.from(entry.bytes,'base64'),{flag:'wx'});
  }
  return{cwd,controls};
}
function persist(value,evidenceDir,name) {
  const file=path.join(evidenceDir,`collection-identity.${name}.json`),raw=json(value);
  writeFileSync(file,raw,{flag:'wx'});value.evidenceRef={path:file,sha256:identityHash(raw)};return value;
}
async function platform(name,f,controlActions) {
  const state=identityModel(name),requests=[],errors=[];
  const server=createServer((req,res)=>{
    let text='',size=0,deliberate=false;
    req.setEncoding('utf8');req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size<=1_000_000)text+=chunk;else req.destroy();});
    req.on('error',()=>{if(!deliberate)errors.push('Identity request failed before complete observation.');});
    req.on('end',()=>{
      let body=null;try{if(text)body=JSON.parse(text);}catch{errors.push('Identity request body was not JSON.');}
      const entry={method:req.method,path:req.url,body,response:null};requests.push(entry);
      const send=value=>{entry.response=copy(value);const raw=JSON.stringify(value);res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)});res.end(raw);};
      if(!identityRouteAllowed(req.method,req.url)||req.method==='GET'&&text){errors.push('Unapproved C01 route/method/body.');send({ret:1,errCode:77,data:null});return;}
      const u=new URL(req.url,'https://api.devfreelog.com'),p=u.pathname;
      if(req.method==='POST'){
        if(!body||Object.keys(body).sort().join(',')!=='name,resourceTitle,resourceTypeCode,subjectType'||body.subjectType!==4
          ||body.name!=='new_collection'||body.resourceTitle!=='新合集'||body.resourceTypeCode!=='CT001'||state.creations!==0){
          errors.push('Invalid C01 POST fields or replay.');send({ret:1,errCode:77,data:null});return;
        }
        const created={resourceId:'created_collection',resourceName:`alice/${body.name}`,resourceTitle:body.resourceTitle,
          resourceTypeCode:body.resourceTypeCode,subjectType:body.subjectType,userId:7,status:0,latestVersion:'',serializeStatus:0};
        state.resources.push(created);state.creations++;
        if(name==='create-local-failure'){
          const sequence=path.join(f.cwd,'.freelog/.sequence'),before=readFileSync(sequence).toString('base64');
          writeFileSync(sequence,'broken-sequence\n');controlActions.push({kind:'sequence-fault',path:'.freelog/.sequence',before,after:readFileSync(sequence).toString('base64'),at:new Date().toISOString()});
        }
        if(name==='create-disconnect'){deliberate=true;entry.response={disconnected:true};req.socket.destroy();return;}
        send(ok({resourceId:created.resourceId,resourceName:name==='create-untrusted'?'alice/wrong':created.resourceName,resourceTypeCode:created.resourceTypeCode}));return;
      }
      if(p==='/v2/resources/types/listSimpleByGroup')send(name==='type-failed'?{ret:1,errCode:0,data:identityTypes}:ok(identityTypes));
      else if(p==='/v2/resources/types/getInfoByCode')send(ok(identityTypeInfo));
      else if(p==='/v2/resources/types/listSimpleByParentCode')send(ok([{code:'CT001',name:'伪叶子',names:'伪祖先'}]));
      else if(p==='/v2/resources'){
        const skip=Number(u.searchParams.get('skip')),rows=state.resources.slice(skip,skip+100);
        send(ok({skip,limit:100,totalItem:state.resources.length,dataList:name==='target-badpage'?rows.slice(0,1):rows}));
      }else if(p.startsWith('/v2/resources/catalogue/'))send(ok(null));
      else{
        const key=decodeURIComponent(p.slice('/v2/resources/'.length));
        const found=state.resources.find(resource=>resource.resourceId===key||resource.resourceName===key)??null;
        send(name==='lookup-failed'?{ret:1,errCode:0,data:null}:ok(found));
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return{state,requests,errors,port:server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
async function stage(name,index,f,server,env,runTty) {
  const trace=path.join(f.controls,`trace.${index}.jsonl`),control=path.join(f.controls,`control.${index}.json`);
  writeFileSync(trace,'',{flag:'wx'});writeFileSync(control,json({cwd:f.cwd,port:server.port,trace,fault:'none'}),{flag:'wx'});
  const tty=identityTtyNames.has(name)&&index===0;
  const o={index,tty,argv:identityCommand(name,index),steps:tty?identitySteps(name):[],before:itemWorkspaceSnapshot(f.cwd),
    homeBefore:itemWorkspaceSnapshot(path.join(f.controls,'home')),remoteBefore:copy(server.state),startedAt:new Date().toISOString()};
  const first=server.requests.length,errors=server.errors.length,childEnv=itemChildEnvironment(env,f.controls,control);
  if(tty)o.result=await runTty({cwd:f.cwd,program:process.execPath,args:['--no-warnings','--experimental-loader',loader,'--import',preload,env.FREELOG_TEST_CLI_BIN,...o.argv],
    steps:o.steps,env:childEnv,timeoutSeconds:30,maxOutputBytes:1_000_000,onSpawn:pid=>{o.childPid=pid;}});
  else Object.assign(o,await itemChildExecute({cliBin:env.FREELOG_TEST_CLI_BIN},o.argv,f.cwd,childEnv,preload));
  o.finishedAt=new Date().toISOString();o.after=itemWorkspaceSnapshot(f.cwd);o.homeAfter=itemWorkspaceSnapshot(path.join(f.controls,'home'));
  o.remoteAfter=copy(server.state);o.requests=copy(server.requests.slice(first));o.trace=readFileSync(trace,'utf8');o.apparatusErrors=server.errors.slice(errors);return o;
}
export async function identityScenario(name,installed,env,evidenceDir,runTty) {
  const f=owned(name),o={name,...f,stages:[],controlActions:[]};let server;
  try{
    server=await platform(name,f,o.controlActions);
    for(let index=0;index<identityStageCount(name);index++){
      if(index===1){
        const sequence=path.join(f.cwd,'.freelog/.sequence'),before=readFileSync(sequence).toString('base64');
        writeFileSync(sequence,'1\n');o.controlActions.push({kind:'sequence-repair',path:'.freelog/.sequence',before,after:readFileSync(sequence).toString('base64'),at:new Date().toISOString()});
      }
      const observed=await stage(name,index,f,server,{...env,FREELOG_TEST_CLI_BIN:installed.cliBin},runTty);o.stages.push(observed);
      if(observed.tty?observed.result?.completed!==true:observed.result?.error||observed.result?.signal||observed.result?.timedOut)break;
    }
  }catch{o.apparatusError='Owned C01 apparatus failed; scene retained.';}
  finally{if(server)await server.close();}
  return persist(o,evidenceDir,name);
}
async function capability(env,evidenceDir,runTty) {
  const f=owned('create-cancel'),trace=path.join(f.controls,'trace.jsonl'),control=path.join(f.controls,'control.json');
  writeFileSync(trace,'',{flag:'wx'});writeFileSync(control,json({cwd:f.cwd,port:1,trace,fault:'none'}),{flag:'wx'});
  const o={name:'capability',...f,argv:identityCapabilityCommand(),startedAt:new Date().toISOString(),before:itemWorkspaceSnapshot(f.cwd),homeBefore:itemWorkspaceSnapshot(path.join(f.controls,'home'))};
  o.result=await runTty({cwd:f.cwd,program:process.execPath,args:['--no-warnings','--experimental-loader',loader,'--import',preload,...o.argv],
    env:itemChildEnvironment(env,f.controls,control),steps:[{expect:'{"stdin":true,"stdout":true}'}],timeoutSeconds:15,maxOutputBytes:100_000,onSpawn:pid=>{o.childPid=pid;}});
  o.finishedAt=new Date().toISOString();o.after=itemWorkspaceSnapshot(f.cwd);o.homeAfter=itemWorkspaceSnapshot(path.join(f.controls,'home'));o.trace=readFileSync(trace,'utf8');return persist(o,evidenceDir,'capability');
}
export async function runCollectionIdentityCases({env=process.env,output=env.FREELOG_TEST_SUITE_REPORT}={}) {
  const startedAt=new Date().toISOString();
  if(typeof output!=='string'||!path.isAbsolute(output)||existsSync(output))throw new Error('A fresh absolute identity suite report is required.');
  const evidenceDir=path.dirname(output);
  if(!lstatSync(evidenceDir).isDirectory()||lstatSync(evidenceDir).isSymbolicLink()||realpathSync(evidenceDir)!==evidenceDir)throw new Error('Identity evidence root must be canonical.');
  if(!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID??'')||env.FREELOG_TEST_RUN_ID!==process.env.FREELOG_TEST_RUN_ID)throw new Error('Identity run ID differs from writer process.');
  const blocked=reason=>{const result={id,status:'BLOCKED',assertions:[],reason,observations:{runId:env.FREELOG_TEST_RUN_ID,startedAt,finishedAt:new Date().toISOString(),executed:false}};writeSuiteCases([result],output);return{cases:[result],exitCode:3};};
  let installed,runTty;try{installed=requireInstalledCli(env);}catch{return blocked('Exact isolated installed candidate is required.');}
  try{({runTty}=await import('./tty-driver.mjs'));}catch{return blocked('Native node-pty is unavailable.');}
  const observed={...installed,runId:env.FREELOG_TEST_RUN_ID,evidenceDir,platform:process.platform,nodeVersion:process.version,startedAt,finishedAt:null,apparatusErrors:[],scenarios:[]};
  observed.capability=await capability(env,evidenceDir,runTty);
  const probe=observed.capability.result;
  if(!probe?.completed||probe.status!==0||probe.signal!==null||probe.stderr||identityText(probe.stdout).trim()!=='{"stdin":true,"stdout":true}')return blocked('Actual native TTY probe failed; owned raw capability retained.');
  const deadline=Date.now()+8*60_000;
  for(const name of identityNames){
    if(Date.now()>deadline){observed.apparatusErrors.push('C01 fixed execution deadline exceeded.');break;}
    const scene=await identityScenario(name,installed,env,evidenceDir,runTty);observed.scenarios.push(scene);
    if(scene.apparatusError){observed.apparatusErrors.push(scene.apparatusError);break;}
    const incomplete=scene.stages.some(s=>s.tty?s.result?.completed!==true:s.result?.error||s.result?.signal||s.result?.timedOut);
    if(incomplete){observed.apparatusErrors.push(`${name}: incomplete command; successors not executed.`);break;}
  }
  observed.finishedAt=new Date().toISOString();const result=evaluateCollectionIdentity(observed);writeSuiteCases([result],output);
  if(result.status==='PASS')for(const scene of [observed.capability,...observed.scenarios]){
    try{cleanupWorkspace(scene.cwd,{success:true,prefixes:['freelog-collection-recovery-work-']});cleanupWorkspace(scene.controls,{success:true,prefixes:['freelog-collection-recovery-controls-']});}
    catch{result.status='FAIL';result.reason='C01 owned cleanup failed; remaining scenes retained.';break;}
  }
  if(result.status!=='PASS')writeSuiteCases([result],output);
  return{cases:[result],exitCode:result.status==='PASS'?0:1};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2).filter(a=>a!=='--skip-build');
  if(args.length&&(args.length!==2||args[0]!=='--env'||args[1]!=='dev')){console.error('Installed C01 permits only --env dev.');process.exitCode=1;}
  else try{const result=await runCollectionIdentityCases();process.stdout.write(JSON.stringify({producer,result:result.cases[0].status})+'\n',()=>process.exit(result.exitCode));}
  catch{console.error('Installed C01 producer failed; existing evidence is never overwritten.');process.exitCode=1;}
}
