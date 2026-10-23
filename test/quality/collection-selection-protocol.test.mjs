/** Actual protocol/raw/semantic negative controls; synthetic fixtures do not prove actual PTY. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {syntheticSelection} from './fixtures/collection-selection.mjs';
import {evaluateCollectionSelection,selectionHash,validateCollectionSelectionFiles,selectionScenarios,selectionExpectedRequests} from '../acceptance/collection-selection-evidence.mjs';
import {selectionRouteAllowed} from '../acceptance/collection-selection-control.mjs';
import {itemRouteAllowed} from '../acceptance/collection-items-control.mjs';
import {acceptanceCatalog,acceptanceScripts} from '../acceptance/catalog.mjs';
import {deliveryRules} from '../../scripts/release/delivery-contract.mjs';
import {acceptanceScope} from '../run-final-acceptance.mjs';
async function validator(){const at=new URL('../acceptance/protocol.mjs',import.meta.url);const text=readFileSync(at,'utf8').replace(/from '(\.[^']+)'/gu,(_,p)=>`from '${new URL(p,at).href}'`);
  return(await import(`data:text/javascript;base64,${Buffer.from(text+'\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;}
function fixture(t){const root=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-selection-protocol-')));
  t.after(()=>{assert.equal(path.dirname(realpathSync(root)),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('freelog-selection-protocol-'));rmSync(root,{recursive:true,force:false});});
  const observations=syntheticSelection(root),result=evaluateCollectionSelection(observations);assert.equal(result.status,'PASS',result.reason);validateCollectionSelectionFiles(observations);
  const file=path.join(root,'outer.evidence.json'),save=()=>{const bytes=JSON.stringify({schemaVersion:1,runId:observations.runId,caseId:result.id,assertions:result.assertions,observations})+'\n';writeFileSync(file,bytes);result.evidenceRef={runId:observations.runId,path:file,sha256:selectionHash(bytes)};};
  const rewrite=(stage)=>{const {evidenceRef,...raw}=stage,bytes=JSON.stringify(raw)+'\n';writeFileSync(evidenceRef.path,bytes);evidenceRef.sha256=selectionHash(bytes);};save();
  return{observations,result,save,rewrite,report:{runId:observations.runId,evidenceDir:root,cliBin:observations.cliBin,startedAt:observations.startedAt,finishedAt:observations.finishedAt}};}
test('synthetic complete selection control traverses actual protocol without becoming native approval',async t=>{const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));});
for(const [name,mutate]of[
  ['transcript',f=>{f.observations.scenarios[1].result.stdout='invented';f.rewrite(f.observations.scenarios[1]);}],
  ['signal',f=>{f.observations.scenarios[0].result.signal=2;f.rewrite(f.observations.scenarios[0]);}],
  ['missing-keys',f=>{f.observations.scenarios[1].steps.pop();f.rewrite(f.observations.scenarios[1]);}],
  ['missing-request',f=>{f.observations.scenarios[1].requests.pop();f.rewrite(f.observations.scenarios[1]);}],
  ['body',f=>{f.observations.scenarios[1].requests.find(r=>r.method==='POST').body.isPublish=1;f.rewrite(f.observations.scenarios[1]);}],
  ['binary',f=>{f.observations.scenarios[0].after.find(e=>e.path==='keep.bin').bytes='AP//';f.rewrite(f.observations.scenarios[0]);}],
  ['pending-txn',f=>{f.observations.scenarios[11].after=f.observations.scenarios[11].after.filter(e=>!e.path.endsWith('.txn.json'));f.rewrite(f.observations.scenarios[11]);}],
  ['remote',f=>{f.observations.scenarios[0].remoteAfter.published=[];f.rewrite(f.observations.scenarios[0]);}],
  ['capability',f=>{f.observations.capability.result.stdout='{"stdin":false,"stdout":true}\n';f.rewrite(f.observations.capability);}],
  ['raw-missing',f=>rmSync(f.observations.scenarios[0].evidenceRef.path)],
  ['bin',f=>writeFileSync(f.observations.cliBin,'changed')],
  ['old-window',f=>{f.report.startedAt=new Date().toISOString();}],
  ['missing-scene',f=>{f.observations.scenarios.pop();}],
  ['run',f=>{f.observations.runId='different-run';}],
])test(`rewritten hashes and claimed PASS cannot hide selection ${name}`,async t=>{const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));mutate(f);f.save();
  assert.throws(()=>validate(f.result,f.report),name==='run'?/^Error: Missing run-bound product evidence: COLLECTION\.ITEMS\.SELECTION_TTY$/u:/SOURCE_CASE_EVIDENCE/u);});
test('selection registration retains seven gaps and exact scope/routes/rule mapping',()=>{
  const leaf=acceptanceCatalog.find(c=>c.id==='COLLECTION.ITEMS.SELECTION_TTY');assert.equal(leaf.required,true);assert.equal(acceptanceCatalog.filter(c=>c.gap).length,7);
  assert.equal(acceptanceScripts().filter(s=>s===leaf.script).length,1);assert.ok(deliveryRules.find(r=>r.id===leaf.parentRule).caseIds.includes(leaf.id));
  assert.deepEqual(acceptanceScope('collection-selection'),{scope:'collection-selection',scripts:['verify-collection-identity.mjs','verify-collection-selection.mjs'],needsTty:false});
  assert.throws(()=>acceptanceScope('collection-selection,other'),/Unknown acceptance scope/u);
  const spec=readFileSync(new URL('../../docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md',import.meta.url),'utf8');
  for(const row of leaf.scenarioRules)assert.ok(spec.includes(`| \`${row.ruleId}\` | \`${row.scenario}\` |`));
  for(const name of selectionScenarios)for(const r of selectionExpectedRequests(name))assert.equal(selectionRouteAllowed(r.method,r.path),true,r.path);
  assert.equal(itemRouteAllowed('GET','/v2/resources?skip=0&limit=50&isSelf=1&subjectType=1'),false);
  for(const p of['/v2/resources?token=leak','/v2/resources?skip=150','/v2/resources?keywords=unapproved','/v2/resources/types/listSimpleByGroup?subjectType=4'])assert.equal(selectionRouteAllowed('GET',p),false);
});
