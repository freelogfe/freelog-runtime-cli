/** Synthetic validator controls only. These fabricated pids/transcripts never approve a candidate. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { identityNames,identityTtyNames,identityCommand,identitySteps,identityStageCount,identityInitialEntries,identityLocalAfter,
  identityModel,identityExpectedRequests,identityCapabilityCommand,identityError,identityRules,identityHash,identityJson } from '../../acceptance/collection-identity-evidence.mjs';
export function syntheticIdentity(root) {
  const base=Date.now()-10_000,at=offset=>new Date(base+offset).toISOString();
  const observed={runId:'synthetic-c01-validator',evidenceDir:root,cliBin:path.join(root,'node_modules/@freelog-cli/cli2/dist/bin/index.js'),
    packageName:'@freelog-cli/cli2',version:'0.5.8',platform:process.platform,nodeVersion:process.version,startedAt:at(0),finishedAt:at(6000),apparatusErrors:[],scenarios:[]};
  mkdirSync(path.dirname(observed.cliBin),{recursive:true});const bin='// synthetic C01 non-executable bin\n';writeFileSync(observed.cliBin,bin);observed.binSha256=identityHash(bin);
  const trace=requests=>[{schemaVersion:1,event:'keyring-replaced'},{schemaVersion:1,event:'ready',guard:'collection-identity-local-v1'},
    ...requests.map(({method,path})=>({schemaVersion:1,event:'request',method,path})),{schemaVersion:1,event:'finished'}].map(JSON.stringify).join('\n')+'\n';
  const persist=(raw,name)=>{const file=path.join(root,`synthetic.c01.${name}.json`),text=identityJson(raw);writeFileSync(file,text,{flag:'wx'});raw.evidenceRef={path:file,sha256:identityHash(text)};return raw;};
  const cwd=name=>path.join(root,`synthetic-cwd-${name}`),controls=name=>path.join(root,`synthetic-controls-${name}`);
  observed.capability=persist({name:'capability',cwd:cwd('capability'),controls:controls('capability'),argv:identityCapabilityCommand(),childPid:123,
    startedAt:at(10),finishedAt:at(50),before:identityInitialEntries('create-cancel'),after:identityInitialEntries('create-cancel'),homeBefore:[],homeAfter:[],
    result:{status:0,signal:null,completed:true,stdout:'{"stdin":true,"stdout":true}\n',stderr:'',completedSteps:1,matchedPrompts:['{"stdin":true,"stdout":true}']},trace:trace([])},'capability');
  for(const [i,name] of identityNames.entries()){
    const start=100+i*100,scene={name,cwd:cwd(name),controls:controls(name),stages:[],controlActions:[]};
    for(let index=0;index<identityStageCount(name);index++){
      const tty=identityTtyNames.has(name)&&index===0,steps=tty?identitySteps(name):[],error=identityError(name,index),requests=identityExpectedRequests(name,index);
      const tail=error?(tty?error.message:JSON.stringify(error)):name.startsWith('create-')&&index===0?'created_collection'
        :name.startsWith('bind-')||index===1?name==='bind-repeat'?'1.json':'2.json':JSON.stringify(identityRules,null,2);
      const stdout=(tty?steps.map(s=>s.expect).join('\n')+'\n'+(['create-hierarchy','create-search','create-input'].includes(name)?'祖父 / 父 / 叶子（CT001）\n':''):'')+tail+'\n';
      scene.stages.push({index,tty,argv:identityCommand(name,index),steps,childPid:123,startedAt:at(start+index*40),finishedAt:at(start+index*40+25),
        result:{status:error?1:0,signal:null,stdout,stderr:'',...(tty?{completed:true,completedSteps:steps.length,matchedPrompts:steps.map(s=>s.expect)}:{error:null,timedOut:false})},
        before:identityInitialEntries(name),after:identityLocalAfter(name,index),homeBefore:[],homeAfter:[],remoteBefore:identityModel(name,index===1),remoteAfter:identityModel(name,true),
        requests,trace:trace(requests),apparatusErrors:[]});
    }
    if(name==='create-local-failure')scene.controlActions=[
      {kind:'sequence-fault',path:'.freelog/.sequence',before:Buffer.from('1\n').toString('base64'),after:Buffer.from('broken-sequence\n').toString('base64'),at:at(start+10)},
      {kind:'sequence-repair',path:'.freelog/.sequence',before:Buffer.from('broken-sequence\n').toString('base64'),after:Buffer.from('1\n').toString('base64'),at:at(start+30)},
    ];
    observed.scenarios.push(persist(scene,name));
  }
  return observed;
}
