/** Synthetic controls test rejection of false evidence; never business/candidate approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {collectionEditCases,editNames,editHash,editInitialEntries,editCommand,editRemote,editExpectedRequests,editExpectedResult,evaluateCollectionEdits,validateCollectionEditFiles} from '../acceptance/collection-edit-evidence.mjs';
import {editRouteAllowed} from '../acceptance/collection-edit-control.mjs';
import {itemRouteAllowed} from '../acceptance/collection-items-control.mjs';
import {acceptanceCatalog} from '../acceptance/catalog.mjs';
import {deliveryRules} from '../../scripts/release/delivery-contract.mjs';
import {acceptanceScope} from '../run-final-acceptance.mjs';
async function validator(){const at=new URL('../acceptance/protocol.mjs',import.meta.url);const source=readFileSync(at,'utf8').replace(/from '(\.[^']+)'/gu,(_,p)=>`from '${new URL(p,at).href}'`);
  return(await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;}
function fixture(t){const root=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-edit-evidence-')));t.after(()=>{assert.equal(path.dirname(realpathSync(root)),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('freelog-edit-evidence-'));rmSync(root,{recursive:true,force:true});});
  const cliBin=path.join(root,'node_modules','@freelog-cli','cli2','dist','bin','index.js');mkdirSync(path.dirname(cliBin),{recursive:true});writeFileSync(cliBin,'Synthetic nonexecuted bin for protocol controls.');
  const startedAt=new Date(Date.now()-1000).toISOString(),finishedAt=new Date(Date.now()-1).toISOString();
  const observed={runId:'synthetic-edit-control',evidenceDir:root,cliBin,packageName:'@freelog-cli/cli2',version:'0.5.8',binSha256:editHash(readFileSync(cliBin)),platform:process.platform,nodeVersion:process.version,startedAt,finishedAt,apparatusErrors:[],scenarios:[]};
  const rewrite=s=>{const {evidenceRef,...raw}=s,bytes=JSON.stringify(raw)+'\n';writeFileSync(evidenceRef.path,bytes);evidenceRef.sha256=editHash(bytes);};
  for(const name of editNames){const requests=editExpectedRequests(name),s={name,cwd:path.join(root,`work-${name}`),controls:path.join(root,`controls-${name}`),argv:editCommand(name),startedAt,finishedAt,childPid:123,
    before:editInitialEntries(),after:structuredClone(editInitialEntries()),remoteBefore:editRemote(name),remoteAfter:editRemote(name,true),requests,result:editExpectedResult(name),apparatusErrors:[],
    trace:[{schemaVersion:1,event:'ready',guard:'collection-edit-local-v1'},...requests.map(({method,path})=>({schemaVersion:1,event:'request',method,path})),{schemaVersion:1,event:'finished'}].map(JSON.stringify).join('\n')+'\n',
    evidenceRef:{path:path.join(root,`${name}.json`)}};rewrite(s);observed.scenarios.push(s);}
  const result=evaluateCollectionEdits(observed);assert.equal(result.status,'PASS',result.reason);validateCollectionEditFiles(observed);
  const file=path.join(root,'case.evidence.json');const save=()=>{const bytes=JSON.stringify({schemaVersion:1,runId:observed.runId,caseId:result.id,assertions:result.assertions,observations:observed})+'\n';writeFileSync(file,bytes);result.evidenceRef={runId:observed.runId,path:file,sha256:editHash(bytes)};};save();
  return{observed,result,save,rewrite,report:{runId:observed.runId,evidenceDir:root,cliBin,startedAt,finishedAt}};
}
test('complete synthetic edit control traverses actual raw/semantic protocol only',async t=>{const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));});
for(const [name,mutate]of [
  ['stdout',f=>{f.observed.scenarios[2].result.stdout='invented';f.rewrite(f.observed.scenarios[2]);}],
  ['signal',f=>{f.observed.scenarios[0].result.signal='SIGKILL';f.rewrite(f.observed.scenarios[0]);}],
  ['request',f=>{f.observed.scenarios[2].requests.pop();f.rewrite(f.observed.scenarios[2]);}],
  ['payload',f=>{const s=f.observed.scenarios[6];s.requests.find(r=>r.method==='PUT').body.sortField='sortId';f.rewrite(s);}],
  ['response',f=>{const s=f.observed.scenarios[2];s.requests.find(r=>r.method==='PUT').response.ret=1;f.rewrite(s);}],
  ['local-binary',f=>{const s=f.observed.scenarios[2];s.after.find(e=>e.path==='keep.bin').bytes='AP//';f.rewrite(s);}],
  ['remote',f=>{const s=f.observed.scenarios[2];s.remoteAfter.published=[];f.rewrite(s);}],
  ['missing-raw',f=>rmSync(f.observed.scenarios[0].evidenceRef.path)],
  ['bin',f=>writeFileSync(f.observed.cliBin,'changed')],
  ['window',f=>{f.report.startedAt=new Date().toISOString();}],
  ['scene',f=>{f.observed.scenarios.pop();}],
])test(`rewritten hashes and claimed PASS cannot hide edit ${name}`,async t=>{const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));mutate(f);f.save();assert.throws(()=>validate(f.result,f.report),/SOURCE_CASE_EVIDENCE/u);});
test('edit scope, source rules and separate transport retain all seven parent obligations',()=>{
  assert.equal(editNames.length,30);assert.equal(collectionEditCases[0].assertionIds.length,31);assert.equal(acceptanceCatalog.filter(c=>c.gap).length,7);
  assert.ok(deliveryRules.find(r=>r.id==='COLLECTION.MANAGEMENT_MATRIX').caseIds.includes('COLLECTION.EDIT.INSTALLED_MATRIX'));
  assert.deepEqual(acceptanceScope('collection-edit'),{scope:'collection-edit',scripts:['verify-collection-edit.mjs','verify-collection-selection.mjs'],needsTty:false});
  const spec=readFileSync(new URL('../../docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md',import.meta.url),'utf8');
  for(const {ruleId}of collectionEditCases[0].scenarioRules)assert.ok(spec.includes(`| ${ruleId} |`));
  for(const name of editNames)for(const r of editExpectedRequests(name))assert.equal(editRouteAllowed(r.method,r.path),true,r.path);
  assert.equal(itemRouteAllowed('PUT','/v2/resources/catalogues/drafts/local_collection/reorder'),false);
  for(const [m,p]of [['POST','/v2/resources/catalogues/drafts/local_collection/items'],['PUT','/v2/resources/local_collection'],['GET','/v2/contracts/list'],['GET','/v2/resources/source_image'],['GET','/v2/resources/local_collection?token=x']])assert.equal(editRouteAllowed(m,p),false);
});
