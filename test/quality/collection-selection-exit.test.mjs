/** The actual standalone entry must flush its summary and exit despite native PTY handles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

for (const exitCode of [0, 1]) test(`selection entry flushes and exits ${exitCode} with an outstanding PTY-like handle`, () => {
  const source=readFileSync(new URL('../verify-collection-selection.mjs',import.meta.url),'utf8');
  const guard='if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){';
  const at=source.indexOf(guard);assert.ok(at>=0,'Actual standalone entry was not found.');
  const entry=source.slice(at).replace(guard,'{');
  // Only the producer result is substituted. The actual exit/summary entry remains unchanged.
  const program=`process.argv=['node','owned-selection'];
const producer='verify-collection-selection.mjs';
async function runCollectionSelectionCases(){setInterval(()=>{},1000);return {cases:[{status:${JSON.stringify(exitCode?'FAIL':'PASS')}}],exitCode:${exitCode}};}
${entry}`;
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/iu.test(key)));
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{env,encoding:'utf8',timeout:2000,maxBuffer:100_000,windowsHide:true});
  assert.ok(!result.error,'Standalone entry remained alive after recording its result.');
  assert.equal(result.signal,null);assert.equal(result.status,exitCode);assert.equal(result.stderr,'');
  assert.deepEqual(JSON.parse(result.stdout),{producer:'verify-collection-selection.mjs',result:exitCode?'FAIL':'PASS'});
});
