/** C01 registration and semantic guards; synthetic controls are never installed acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syntheticIdentity } from './fixtures/collection-identity.mjs';
import { evaluateCollectionIdentity, validateCollectionIdentityFiles, identityHash, identityExpectedRequests, identityNames, identitySteps } from '../acceptance/collection-identity-evidence.mjs';
import { identityRouteAllowed } from '../acceptance/collection-identity-control.mjs';

test('C01 registers all 33 fixed identity scenarios without deleting seven mandatory gaps', () => {
  const leaf = acceptanceCatalog.find((item) => item.id === 'COLLECTION.IDENTITY.INSTALLED_MATRIX');
  assert.ok(leaf, 'C01 installed descriptor missing');
  assert.equal(leaf.required, true); assert.equal(leaf.kind, 'product-case');
  assert.equal(leaf.script, 'verify-collection-identity.mjs'); assert.equal(leaf.assertionIds.length, 34);
  assert.deepEqual(leaf.scenarioRules.map((row) => row.ruleId), Array.from({ length: 33 }, (_, i) => `C01.A${String(i + 1).padStart(2, '0')}`));
  assert.equal(new Set(leaf.scenarioRules.map((row) => row.scenario)).size, 33);
  assert.equal(acceptanceCatalog.filter((item) => item.gap).length, 7);
  assert.ok(acceptanceScripts().includes(leaf.script));
  assert.ok(deliveryRules.find((rule) => rule.id === leaf.parentRule).caseIds.includes(leaf.id));
  assert.deepEqual(acceptanceScope('collection-selection'), { scope: 'collection-selection',
    scripts: ['verify-collection-identity.mjs', 'verify-collection-selection.mjs'], needsTty: false });
});

async function validator() {
  const at=new URL('../acceptance/protocol.mjs',import.meta.url);
  const source=readFileSync(at,'utf8').replace(/from '(\.[^']+)'/gu,(_,p)=>`from '${new URL(p,at).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),'freelog-c01-protocol-')));
  t.after(()=>{assert.equal(path.dirname(realpathSync(root)),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('freelog-c01-protocol-'));rmSync(root,{recursive:true,force:false});});
  const observations=syntheticIdentity(root),result=evaluateCollectionIdentity(observations);
  assert.equal(result.status,'PASS',result.reason);validateCollectionIdentityFiles(observations);
  const file=path.join(root,'outer.evidence.json');
  const save=()=>{const text=JSON.stringify({schemaVersion:1,runId:observations.runId,caseId:result.id,assertions:result.assertions,observations})+'\n';writeFileSync(file,text);result.evidenceRef={runId:observations.runId,path:file,sha256:identityHash(text)};};
  const rewrite=scene=>{const{evidenceRef,...raw}=scene,text=JSON.stringify(raw)+'\n';writeFileSync(evidenceRef.path,text);evidenceRef.sha256=identityHash(text);};
  save();return{observations,result,save,rewrite,report:{runId:observations.runId,evidenceDir:root,cliBin:observations.cliBin,startedAt:observations.startedAt,finishedAt:observations.finishedAt}};
}
test('complete synthetic C01 control traverses actual raw/semantic protocol, not native approval',async t=>{
  const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));
});
for(const[name,mutate]of[
  ['terminal',f=>{f.observations.scenarios[1].stages[0].result.stdout='invented';f.rewrite(f.observations.scenarios[1]);}],
  ['signal',f=>{f.observations.scenarios[0].stages[0].result.signal='SIGTERM';f.rewrite(f.observations.scenarios[0]);}],
  ['false-success',f=>{f.observations.scenarios[7].stages[0].result.status=0;f.rewrite(f.observations.scenarios[7]);}],
  ['post-body',f=>{f.observations.scenarios[0].stages[0].requests.find(r=>r.method==='POST').body.subjectType=1;f.rewrite(f.observations.scenarios[0]);}],
  ['automatic-replay',f=>{const s=f.observations.scenarios[10];s.stages[0].requests.push(structuredClone(s.stages[0].requests.at(-1)));f.rewrite(s);}],
  ['local-byte',f=>{f.observations.scenarios[18].stages[0].after.find(e=>e.path==='keep.bin').bytes='AQ==';f.rewrite(f.observations.scenarios[18]);}],
  ['bind-counter',f=>{f.observations.scenarios[14].stages[0].after.find(e=>e.path==='.freelog/.sequence').bytes='Mgo=';f.rewrite(f.observations.scenarios[14]);}],
  ['wrong-target',f=>{f.observations.scenarios[21].stages[0].requests.at(-1).path='/v2/resources/catalogue/owned_000/items/collectRules';f.rewrite(f.observations.scenarios[21]);}],
  ['remote-side-effect',f=>{f.observations.scenarios[4].stages[0].remoteAfter.creations=1;f.rewrite(f.observations.scenarios[4]);}],
  ['home-write',f=>{f.observations.scenarios[0].stages[0].homeAfter=[{path:'unexpected',kind:'file',bytes:'AA=='}];f.rewrite(f.observations.scenarios[0]);}],
  ['hidden-trace',f=>{f.observations.scenarios[1].stages[0].trace+='{"schemaVersion":1,"event":"blocked"}\n';f.rewrite(f.observations.scenarios[1]);}],
  ['fault-unproved',f=>{f.observations.scenarios[11].controlActions=[];f.rewrite(f.observations.scenarios[11]);}],
  ['keys',f=>{f.observations.scenarios[1].stages[0].steps=[];f.rewrite(f.observations.scenarios[1]);}],
  ['raw-missing',f=>rmSync(f.observations.scenarios[0].evidenceRef.path)],
  ['bin',f=>writeFileSync(f.observations.cliBin,'changed')],
  ['old-window',f=>{f.report.startedAt=new Date().toISOString();}],
  ['missing-scene',f=>{f.observations.scenarios.pop();}],
])test(`claimed PASS and rewritten hashes cannot hide C01 ${name}`,async t=>{
  const f=fixture(t),validate=await validator();assert.doesNotThrow(()=>validate(f.result,f.report));mutate(f);f.save();assert.throws(()=>validate(f.result,f.report),/SOURCE_CASE_EVIDENCE/u);
});
test('C01 fixed routes admit exactly its requests and exclude payments/items/unknown resources',()=>{
  for(const name of identityNames)for(let stage=0;stage<(name==='create-local-failure'?2:1);stage++)for(const r of identityExpectedRequests(name,stage))assert.equal(identityRouteAllowed(r.method,r.path),true,`${name}: ${r.path}`);
  for(const[method,p]of[['PUT','/v2/resources/local_collection'],['POST','/v2/contracts/batchSign'],['POST','/v2/resources/catalogues/drafts/local_collection/items'],
    ['GET','/v2/resources/unknown'],['GET','/v2/resources?skip=0&limit=100&isSelf=1&subjectType=1'],['GET','/v2/resources/types/listSimpleByGroup?subjectType=4'],
    ['GET','/v2/resources/local_collection?isLoadLatestVersionInfo=1&token=unapproved']])assert.equal(identityRouteAllowed(method,p),false,p);
});
test('expected C01 records are independent copies, so a negative control cannot mutate its own oracle',()=>{
  const before=JSON.stringify(identityExpectedRequests('create-code')),rows=identityExpectedRequests('create-code');
  rows.find(r=>r.method==='POST').body.subjectType=42;
  rows.find(r=>r.path.startsWith('/v2/resources/types/listSimpleByGroup')).response.data[0].name='tampered';
  assert.equal(JSON.stringify(identityExpectedRequests('create-code')),before);
});
test('search input cue is the actual question, not the same text already visible as a menu choice',()=>{
  const cue=identitySteps('create-search')[1].expect;
  assert.equal('? 选择合集类型\n  祖父 (ROOT)\n  搜索合集类型\n  直接输入类型编号\n  取消'.includes(cue),false);
  assert.equal(cue,'? 搜索合集类型');
});
test('wrong POST is rejected by its own semantic assertion even when all raw hashes remain valid',t=>{
  const f=fixture(t),scene=f.observations.scenarios[0];
  scene.stages[0].requests.find(r=>r.method==='POST').body.subjectType=1;f.rewrite(scene);
  assert.doesNotThrow(()=>validateCollectionIdentityFiles(f.observations));
  const checked=evaluateCollectionIdentity(f.observations);
  assert.deepEqual(checked.assertions.filter(a=>!a.passed).map(a=>a.id),['identity-create-code']);
});
