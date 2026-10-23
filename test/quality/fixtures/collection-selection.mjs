/** Synthetic protocol controls; no native process was run and no approval may use these records. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { selectionScenarios,selectionFixture,selectionInitialEntries,selectionCommand,selectionSteps,selectionRemoteState,selectionExpectedRequests,selectionHash,selectionCapabilityCommand } from '../../acceptance/collection-selection-evidence.mjs';
export function syntheticSelection(root) {
  const startedAt=new Date(Date.now()-2000).toISOString(),finishedAt=new Date(Date.now()-1000).toISOString();
  const observed={runId:'synthetic-selection-validator',evidenceDir:root,cliBin:path.join(root,'node_modules/@freelog-cli/cli2/dist/bin/index.js'),packageName:'@freelog-cli/cli2',version:'0.5.8',platform:process.platform,nodeVersion:process.version,startedAt,finishedAt,apparatusErrors:[],scenarios:[]};
  mkdirSync(path.dirname(observed.cliBin),{recursive:true});writeFileSync(observed.cliBin,'// synthetic non-executable bin identity\n');observed.binSha256=selectionHash('// synthetic non-executable bin identity\n');
  const trace=(requests)=>[{schemaVersion:1,event:'keyring-replaced'},{schemaVersion:1,event:'ready',guard:'collection-selection-local-v1'},
    ...requests.map(({method,path})=>({schemaVersion:1,event:'request',method,path})),{schemaVersion:1,event:'finished'}].map(JSON.stringify).join('\n')+'\n';
  const persist=(raw,name)=>{const file=path.join(root,`synthetic.${name}.json`),bytes=JSON.stringify(raw)+'\n';writeFileSync(file,bytes,{flag:'wx'});raw.evidenceRef={path:file,sha256:selectionHash(bytes)};return raw;};
  observed.capability=persist({name:'capability',argv:selectionCapabilityCommand(),childPid:123,startedAt,finishedAt,before:selectionInitialEntries('cancel'),after:selectionInitialEntries('cancel'),
    result:{status:0,signal:null,completed:true,stdout:'{"stdin":true,"stdout":true}\n',stderr:'',completedSteps:1,matchedPrompts:['{"stdin":true,"stdout":true}']},trace:trace([])},'capability');
  const errors={cancel:'已取消单品选择','ctrl-c':'已取消单品选择',decline:'已取消','late-freeze':'冻结合集不能修改目录草稿','late-owner':'单品必须是当前账号已上架且已有版本的单资源，未提交添加。','json-required':JSON.stringify({code:'COLLECTION_ITEM_SOURCE_REQUIRED',message:'非交互或JSON调用请明确提供来源单资源 id: 或 name:'})};
  for(const name of selectionScenarios){const f=selectionFixture(name),steps=selectionSteps(name),requests=selectionExpectedRequests(name);
    const tail=f.writes?`已添加：${f.selected.map(r=>r.resourceId).join('、')}；未变更：无`:errors[name];
    observed.scenarios.push(persist({name,argv:selectionCommand(name),steps,startedAt,finishedAt,childPid:123,
      result:{status:f.writes?0:1,signal:null,completed:true,stderr:'',completedSteps:steps.length,matchedPrompts:steps.map(s=>s.expect),
        stdout:steps.map(s=>s.expect).join('\n')+'\n'+(name==='disabled'?'非当前账号 不是单资源 未上架 没有最新版本 已在目录草稿\n':'')+(name==='limit-100'?'已选满100项\n':'')+tail+'\n'},
      before:selectionInitialEntries(name),after:selectionInitialEntries(name),remoteBefore:selectionRemoteState(name),remoteAfter:selectionRemoteState(name,true),requests,trace:trace(requests),apparatusErrors:[]},name));}
  return observed;
}
