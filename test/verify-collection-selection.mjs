#!/usr/bin/env node
/** Actual installed CLI through native node-pty, isolated credentials and loopback platform only. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemWorkspaceSnapshot, itemChildEnvironment } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { selectionRouteAllowed } from './acceptance/collection-selection-control.mjs';
import { selectionScenarios, selectionFixture, selectionInitialEntries, selectionCommand, selectionSteps, selectionTypes,
  selectionListing, selectionRemoteState, selectionHash, evaluateCollectionSelection, selectionText, selectionCapabilityCommand } from './acceptance/collection-selection-evidence.mjs';
const id = 'COLLECTION.ITEMS.SELECTION_TTY', producer = 'verify-collection-selection.mjs';
const loader = new URL('./acceptance/collection-recovery-loader.mjs', import.meta.url).href;
const preload = new URL('./acceptance/collection-selection-preload.mjs', import.meta.url).href;
const clone = (v) => structuredClone(v), json = (v) => `${JSON.stringify(v, null, 2)}\n`, ok = (data) => ({ ret: 0, errCode: 0, data });
const draftPath = '/v2/resources/catalogues/drafts/local_collection/items';

async function localPlatform(f, name) {
  const state = selectionRemoteState(name), requests = [], errors = []; let targets = 0;
  const server = createServer((req, res) => {
    let text = '', bytes = 0;
    req.setEncoding('utf8'); req.on('data', (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes <= 1_000_000) text += chunk; else req.destroy(); });
    req.on('error', () => errors.push('Local selection request failed before complete observation.'));
    req.on('end', () => {
      let body = null; try { if (text) body = JSON.parse(text); } catch { errors.push('Selection request body was not JSON.'); }
      const entry = { method: req.method, path: req.url, body, response: null }; requests.push(entry);
      const send = (value) => { entry.response = clone(value); const bytes = JSON.stringify(value);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }); res.end(bytes); };
      if (!selectionRouteAllowed(req.method, req.url) || req.method === 'GET' && text) { errors.push('Unapproved selection method/route/body.'); send({ ret: 1, errCode: 77, data: null }); return; }
      const u = new URL(req.url, 'https://api.devfreelog.com'), p = u.pathname;
      if (req.method === 'POST') {
        if (!body || !Array.isArray(body.addCollectionItems)) { errors.push('Invalid actual selection POST body.'); send({ret:1,errCode:77,data:null}); return; }
        const added = [];
        for (const item of body.addCollectionItems) {
          const source = f.rows.find((r) => r.resourceId === item.resourceId);
          if (!source || typeof item.itemTitle !== 'string') { errors.push('Unknown actual POST source.'); send({ret:1,errCode:77,data:null}); return; }
          state.draft.push({ itemId: `item_${item.resourceId.slice(7)}`, itemTitle: item.itemTitle, sortId: state.draft.length + 1,
            mountResourceInfo: {resourceId:source.resourceId,resourceName:source.resourceName,resourceTitle:source.resourceTitle} });
          added.push({resourceId:item.resourceId,itemTitle:item.itemTitle});
        }
        if (body.isPublish === 1) state.published = clone(state.draft);
        send(ok({addSuccessfulItems:added,addFailedItems:[],ignoreItems:[]})); return;
      }
      if (p === '/v2/resources/local_collection') {
        targets++; if (name === 'late-freeze' && targets >= 3) state.target.status = 2; send(ok(state.target));
      } else if (p === '/v2/resources/catalogue/local_collection/items/collectRules') send(ok(null));
      else if (p === '/v2/resources') send(selectionListing(f,u.searchParams));
      else if (p === '/v2/resources/types/listSimpleByGroup') send(ok(selectionTypes));
      else if (p === draftPath) {
        const skip=Number(u.searchParams.get('skip')); send(ok({skip,limit:100,totalItem:state.draft.length,dataList:state.draft.slice(skip,skip+100)}));
      } else if (p === `${draftPath}/checkExists`) send(ok(u.searchParams.get('resourceIds').split(',').map((resourceId)=>({resourceId,isExists:state.draft.some(r=>r.mountResourceInfo.resourceId===resourceId)}))));
      else {
        const source=f.rows.find(r=>p===`/v2/resources/${r.resourceId}`);
        if(!source){errors.push('Unexpected source request.');send({ret:1,errCode:77,data:null});return;}
        if(name==='late-owner')state.sourceOwners[source.resourceId]=8;
        send(ok({...source,userId:state.sourceOwners[source.resourceId]}));
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {state,requests,errors,port:server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
function owned(name) {
  const cwd=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-work-'))), controls=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls,'home'));
  for(const entry of selectionInitialEntries(name)) {
    const file=path.join(cwd,entry.path);
    if(entry.kind==='directory')mkdirSync(file,{recursive:true});else writeFileSync(file,Buffer.from(entry.bytes,'base64'),{flag:'wx'});
  }
  const trace=path.join(controls,'trace.jsonl'),control=path.join(controls,'control.json');writeFileSync(trace,'',{flag:'wx'});
  return {cwd,controls,trace,control};
}
function persist(value,evidenceDir,name) {
  const file=path.join(evidenceDir,`collection-selection.${name}.json`),bytes=json(value);
  writeFileSync(file,bytes,{flag:'wx'});value.evidenceRef={path:file,sha256:selectionHash(bytes)};return value;
}
export async function selectionScenario(name,installed,env,evidenceDir,runTty) {
  const f=owned(name), observed={name,cwd:f.cwd,controls:f.controls,argv:selectionCommand(name),steps:selectionSteps(name)};let server;
  try {
    server=await localPlatform(selectionFixture(name),name);
    writeFileSync(f.control,json({cwd:f.cwd,port:server.port,trace:f.trace,fault:'none'}),{flag:'wx'});
    observed.before=itemWorkspaceSnapshot(f.cwd);observed.remoteBefore=clone(server.state);observed.startedAt=new Date().toISOString();
    observed.result=await runTty({cwd:f.cwd,program:process.execPath,args:['--no-warnings','--experimental-loader',loader,'--import',preload,installed.cliBin,...observed.argv],
      steps:observed.steps,env:itemChildEnvironment(env,f.controls,f.control),timeoutSeconds:60,maxOutputBytes:1_000_000,onSpawn:(pid)=>{observed.childPid=pid;}});
    observed.finishedAt=new Date().toISOString();observed.after=itemWorkspaceSnapshot(f.cwd);observed.remoteAfter=clone(server.state);
    observed.requests=clone(server.requests);observed.trace=readFileSync(f.trace,'utf8');observed.apparatusErrors=clone(server.errors);
  } catch {observed.apparatusErrors=[...(observed.apparatusErrors??[]),'Owned native selection apparatus failed.'];}
  finally {if(server)await server.close();}
  return persist(observed,evidenceDir,name);
}
async function capability(env,evidenceDir,runTty) {
  const f=owned('cancel'), observed={name:'capability',cwd:f.cwd,controls:f.controls,argv:selectionCapabilityCommand(),startedAt:new Date().toISOString(),before:itemWorkspaceSnapshot(f.cwd)};
  writeFileSync(f.control,json({cwd:f.cwd,port:1,trace:f.trace,fault:'none'}),{flag:'wx'});
  observed.result=await runTty({cwd:f.cwd,program:process.execPath,args:['--no-warnings','--experimental-loader',loader,'--import',preload,...observed.argv],
    env:itemChildEnvironment(env,f.controls,f.control),steps:[{expect:'{"stdin":true,"stdout":true}'}],timeoutSeconds:20,maxOutputBytes:100_000,onSpawn:pid=>{observed.childPid=pid;}});
  observed.finishedAt=new Date().toISOString();observed.after=itemWorkspaceSnapshot(f.cwd);observed.trace=readFileSync(f.trace,'utf8');return persist(observed,evidenceDir,'capability');
}
export async function runCollectionSelectionCases({env=process.env,output=env.FREELOG_TEST_SUITE_REPORT}={}) {
  const startedAt=new Date().toISOString();
  if(typeof output!=='string'||!path.isAbsolute(output)||existsSync(output))throw new Error('A fresh absolute FREELOG_TEST_SUITE_REPORT is required; existing evidence is never overwritten.');
  const evidenceDir=path.dirname(output);
  if(realpathSync(evidenceDir)!==evidenceDir||!lstatSync(evidenceDir).isDirectory()||lstatSync(evidenceDir).isSymbolicLink())throw new Error('Selection evidence directory must be canonical.');
  if(!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID??'')||env.FREELOG_TEST_RUN_ID!==process.env.FREELOG_TEST_RUN_ID)throw new Error('Selection run ID differs from writer process.');
  const blocked=(reason,extra={})=>{const result={id,status:'BLOCKED',assertions:[],reason,observations:{runId:env.FREELOG_TEST_RUN_ID,startedAt,finishedAt:new Date().toISOString(),executed:false,...extra}};
    writeSuiteCases([result],output);return{cases:[result],exitCode:3};};
  let installed,runTty;
  try{installed=requireInstalledCli(env);}catch{return blocked('A valid isolated installed candidate is required.');}
  try{({runTty}=await import('./tty-driver.mjs'));}catch{return blocked('Native node-pty is unavailable; no selection command executed.');}
  const observed={runId:env.FREELOG_TEST_RUN_ID,evidenceDir,...installed,platform:process.platform,nodeVersion:process.version,startedAt,finishedAt:null,scenarios:[],apparatusErrors:[]};
  observed.capability=await capability(env,evidenceDir,runTty);
  const p=observed.capability.result;
  if(!p.completed||p.status!==0||p.signal!==null||p.stderr||selectionText(p.stdout).trim()!=='{"stdin":true,"stdout":true}')return blocked('Native TTY capability failed; owned diagnostic scene retained.',{capability:observed.capability});
  const deadline=Date.now()+12*60_000;
  for(const name of selectionScenarios){
    if(Date.now()>deadline){observed.apparatusErrors.push('Fixed selection deadline exceeded.');break;}
    const result=await selectionScenario(name,installed,env,evidenceDir,runTty);observed.scenarios.push(result);observed.apparatusErrors.push(...result.apparatusErrors.map(e=>`${name}: ${e}`));
    if(result.result?.completed!==true){observed.apparatusErrors.push(`${name}: native command incomplete; successors not executed.`);break;}
  }
  observed.finishedAt=new Date().toISOString();const result=evaluateCollectionSelection(observed);writeSuiteCases([result],output);
  if(result.status==='PASS')for(const scene of[observed.capability,...observed.scenarios]){
    // The JSON rejection case deliberately retains an unresolved local transaction.
    if(existsSync(path.join(scene.cwd,'.freelog/.txn.json')))continue;
    try{cleanupWorkspace(scene.cwd,{success:true,prefixes:['freelog-collection-recovery-work-']});cleanupWorkspace(scene.controls,{success:true,prefixes:['freelog-collection-recovery-controls-']});}
    catch{result.status='FAIL';result.reason='Owned selection cleanup blocked; remaining scenes retained.';break;}
  }
  if(result.status!=='PASS')writeSuiteCases([result],output);
  return{cases:[result],exitCode:result.status==='PASS'?0:1};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2).filter(a=>a!=='--skip-build');
  if(args.length&&(args.length!==2||args[0]!=='--env'||args[1]!=='dev')) { console.error('Installed collection selection permits only --env dev.');process.exitCode=1; }
  else try{
    const result=await runCollectionSelectionCases();
    // Native PTY handles may outlive all completed scenarios. Only this standalone
    // producer exits explicitly, after raw evidence, guarded cleanup and stdout flush.
    process.stdout.write(JSON.stringify({producer,result:result.cases[0].status})+'\n',()=>process.exit(result.exitCode));
  }catch{console.error('Installed selection producer failed; existing evidence is never overwritten.');process.exitCode=1;}
}
