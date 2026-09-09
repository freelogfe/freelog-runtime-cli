#!/usr/bin/env node
/**
 * 0.5.3 全量真网验证（dev，primary），严格按 docs/一期/产品方案/使用 落地。
 * 结果：%TEMP%/freelog-runtime-cli-verification/published-053-full.txt
 * 设计：隔离 HOME（无全局回落污染）、精确 argv（无 shell 拆参）、覆盖
 *   快速上手、日常路径、主题插件、版本工作稿、资源管理、环境凭据、本地文件参考、按场景操作、命令参考
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BIN = 'C:/Users/45534/AppData/Roaming/nvm/v22.18.0/node_modules/@freelog-cli/cli2/dist/bin/index.js';
const creds = JSON.parse(readFileSync('D:/appinside/freelog-runtime-cli/test/.freelog-test-credentials.local.json','utf8')).primary;
const mediaVideo = 'D:/appinside/freelog-runtime-cli/test/fixtures/media/sample-video.mp4';
const mediaImage = 'D:/appinside/freelog-runtime-cli/test/fixtures/media/sample-image.png';
const policyFreeJson = 'D:/appinside/freelog-runtime-cli/test/fixtures/policies/free.json';
const pool = JSON.parse(readFileSync('D:/appinside/freelog-runtime-cli/test/.freelog-test-resource-pool.local.json','utf8'));
const depTargets = pool.resources.filter(r => r.policyId && r.resourceTypeCode !== 'RT006003').slice(0,2);
const dep0 = depTargets[0]; const dep1 = depTargets[1] || depTargets[0];

const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'published-053-full.txt');
mkdirSync(reportDir, { recursive: true });
const lines = []; const results = [];
function log(t){ console.log(t); lines.push(t); }
function record(name, pass, note=''){ results.push({name, pass, note}); log(`  => ${pass?'PASS':'FAIL'}${note?`  ${note}`:''}`); }
function cli(args, { cwd=root, input, envExtra }={}){
  const env = { ...process.env, ...envExtra };
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding:'utf8', timeout: 300000, env });
  const out=(r.stdout??'').trim(); const err=(r.stderr??'').trim(); const all=out+(err?'\n'+err:'');
  log(`[exit ${r.status}] freelog-cli ${args.join(' ')}`);
  if(out) log(`  out: ${out.slice(0,300).replaceAll('\n',' | ')}`);
  if(err) log(`  err: ${err.slice(0,300).replaceAll('\n',' | ')}`);
  return { status:r.status, out, err, all };
}

const root = mkdtempSync(path.join(tmpdir(), 'pub053-full-'));
const fakeHome = mkdtempSync(path.join(tmpdir(), 'pub053-home-'));
const baseEnv = { USERPROFILE: fakeHome, HOME: fakeHome, USERNAME: 'test', HOMEPATH: fakeHome };
const E = ['--env','dev'];
let resourceId1='', shortName1='', resourceId2='';

try{
  const tag = Date.now().toString(36);
  shortName1 = `full-${tag}`;
  log(`=== 0.5.3 全量真网验证 === ${new Date().toISOString()}`);
  log(`root: ${root}  fakeHome: ${fakeHome}  dep0: ${dep0.resourceId} (${dep0.resourceName})`);

  // 0. 使用文档自带性：--help 打印手册路径
  log('\n--- 0. 安装与帮助 ---');
  const help = cli(['--help'], { envExtra: baseEnv });
  record('顶层 --help 打印手册路径', help.status===0 && help.all.includes('使用文档'), help.all.slice(0,80));
  const cv = cli(['--cli-version'], { envExtra: baseEnv });
  record('--cli-version 输出 0.5.3', cv.status===0 && cv.all.includes('0.5.3'));
  const noVer = cli(['--version'], { envExtra: baseEnv });
  record('--version 不存在（unknown option）', noVer.status!==0 && noVer.all.includes('unknown option'));
  const vHelp = cli(['version','--help'], { envExtra: baseEnv });
  record('version --help 正常', vHelp.status===0);
  const rHelp = cli(['resource','--help'], { envExtra: baseEnv });
  record('resource --help 正常', rHelp.status===0 && rHelp.all.includes('sync'));
  const tHelp = cli(['type','--help'], { envExtra: baseEnv });
  record('type --help 正常', tHelp.status===0);

  // 1. 环境与凭据：prod 拦截、无凭据、坏凭据
  log('\n--- 1. 环境与凭据 ---');
  const prod = cli(['login','--login-name',creds.loginName,'--password-stdin','--yes'], { input: creds.password, envExtra: baseEnv });
  record('默认 prod 被拦截', prod.status!==0 && prod.all.includes('prod'));
  const noAuthStatus = cli(['status',...E], { envExtra: baseEnv });
  record('无凭据 status 不查线上', noAuthStatus.status===0 && noAuthStatus.all.includes('未查询'));
  const bad = cli(['login','--login-name',creds.loginName,'--password-stdin','--yes',...E], { input:'wrong', envExtra: baseEnv });
  record('坏凭据被拒', bad.status!==0 && bad.all.toLowerCase().includes('密码'));

  // 2. 登录（使用文档 01-快速上手 §1）
  log('\n--- 2. 登录 ---');
  const login = cli(['login','--login-name',creds.loginName,'--password-stdin','--yes',...E], { input: creds.password, envExtra: baseEnv });
  record('login 成功', login.status===0 && login.all.includes('登录成功'));
  // 全局凭据隔离校验：fakeHome 下无全局
  const homeAuth = path.join(fakeHome, '.freelog', 'auth-default.json');
  // 不要求存在；只记录

  // 3. 快速上手 §2 建立工程身份（init . --type --artifact）
  log('\n--- 3. init 建立工程身份 ---');
  copyFileSync(mediaVideo, path.join(root, 'video.mp4'));
  copyFileSync(mediaImage, path.join(root, 'cover.jpg'));
  const initNoType = cli(['init', path.join(root,'projNoType'), '--yes', ...E], { envExtra: baseEnv });
  record('init 缺类型非交互被拒', initNoType.status!==0);
  const init = cli(['init','.', '--type','RT006003','--artifact','video.mp4','--yes',...E], { envExtra: baseEnv });
  record('init . --type RT006003 --artifact video.mp4', init.status===0 && init.all.includes('1.json'));
  // 检查本地文件
  const oneJson = path.join(root,'.freelog','1.json');
  const one = existsSync(oneJson) ? JSON.parse(readFileSync(oneJson,'utf8')) : null;
  record('.freelog/1.json 写入且 filePath=video.mp4', !!(one && one.filePath==='video.mp4' && one.typeCode==='RT006003'));
  record('N.json 不含 resourceId（未绑定）', !!(one && !one.resourceId));
  // init 幂等：当前目录已有 auth+1.json，再 init . 应提示？使用文档说只存在 .freelog/auth 时可 init
  const initDup = cli(['init','.', '--type','RT006003','--artifact','video.mp4','--yes',...E], { envExtra: baseEnv });
  record('重复 init 被拦或提示', initDup.status!==0 || initDup.all.includes('已'));

  // 3b. 主题/插件模板（使用文档 03）
  log('\n--- 3b. 主题/插件模板 ---');
  const tplList = cli(['template','list',...E], { envExtra: baseEnv });
  record('template list', tplList.status===0 && tplList.all.includes('vite'));
  const themeDir = path.join(root, 'my-theme-tpl');
  const initTheme = cli(['init','theme', themeDir, '--template','vite-react-ts','--yes'], { envExtra: baseEnv });
  record('init theme --template vite-react-ts', initTheme.status===0);
  if(existsSync(themeDir)){
    const tj = path.join(themeDir,'.freelog','1.json');
    const th = existsSync(tj) ? JSON.parse(readFileSync(tj,'utf8')) : null;
    record('主题工程 N.json typeCode=RT001 filePath=dist', !!(th && th.typeCode==='RT001' && th.filePath==='dist'));
    // 检查模板内容是否复制（至少有 package.json 或 vite.config）
    const hasPkg = existsSync(path.join(themeDir,'package.json'));
    record('主题模板内容已复制', hasPkg);
  } else {
    record('主题工程目录存在', false, '未创建');
  }

  // 4. 创建线上资源壳（使用文档 02 日常路径）
  log('\n--- 4. create 建壳 ---');
  const create = cli(['create','--title',`标题-${tag}`,'--name',shortName1,'--artifact','video.mp4','--yes',...E], { envExtra: baseEnv });
  record('create --title/--name/--artifact', create.status===0, create.out.slice(0,40));
  resourceId1 = create.out.trim().split('\n')[0]?.trim() || '';
  if(!resourceId1 && one) {
    const updated = existsSync(oneJson) ? JSON.parse(readFileSync(oneJson,'utf8')) : null;
    resourceId1 = updated?.resourceId || '';
  }
  record('create 回写 resourceId', !!resourceId1);
  const afterCreate = existsSync(oneJson) ? JSON.parse(readFileSync(oneJson,'utf8')) : null;
  record('N.json 已绑定 resourceId/name', !!(afterCreate && afterCreate.resourceId && afterCreate.name===shortName1));

  // 5. 上传检查并提交首版（使用文档 01 §4）
  log('\n--- 5. create-version 首版 ---');
  const prep = cli(['create-version','--prepare','--artifact','video.mp4',...E], { envExtra: baseEnv });
  record('create-version --prepare', prep.status===0 && prep.all.includes('已备稿'));
  const localShow = cli(['version','show','--local',...E], { envExtra: baseEnv });
  record('version show --local 有稿', localShow.status===0 && localShow.all.includes('video.mp4'));
  const submit = cli(['create-version','--yes','--artifact','video.mp4',...E], { envExtra: baseEnv });
  record('create-version --yes 提交 1.0.0', submit.status===0 && submit.all.includes('1.0.0'));
  const afterSubmitLocal = cli(['version','show','--local',...E], { envExtra: baseEnv });
  record('提交后无本地稿', afterSubmitLocal.status!==0 && afterSubmitLocal.all.includes('没有本地版本工作稿'));
  const showOnline = cli(['version','show',...E], { envExtra: baseEnv });
  record('version show 线上 1.0.0', showOnline.status===0 && showOnline.all.includes('"version": "1.0.0"'));
  // 首版固定 1.0.0，重复提交应被拦
  const again = cli(['create-version','--yes',...E], { envExtra: baseEnv });
  record('已有版本 create-version 被拦', again.status!==0 && again.all.includes('update-version'));
  // 空 N.version.json 不应存在
  record('.freelog/1.version.json 已清理', !existsSync(path.join(root,'.freelog','1.version.json')));

  // 6. 版本工作稿编辑（使用文档 04）
  log('\n--- 6. 版本工作稿编辑 ---');
  // 先拉更新稿，再编辑
  const pull = cli(['version','draft','pull','--yes',...E], { envExtra: baseEnv });
  record('version draft pull (latest)', pull.status===0 && pull.all.includes('已拉'));
  // draft description
  const draftDesc = cli(['version','draft','description','--description','更新稿说明',...E], { envExtra: baseEnv });
  record('version draft description', draftDesc.status===0);
  // attr add/set/rm/list
  const attrAdd = cli(['version','attr','add','名称=作者 键=author 值=全量',...E], { envExtra: baseEnv });
  record('version attr add 一行式', attrAdd.status===0);
  const attrDup = cli(['version','attr','add','名称=作者 键=author 值=x',...E], { envExtra: baseEnv });
  record('attr 键重复被拒', attrDup.status!==0 && attrDup.all.includes('已存在'));
  const attrNameDup = cli(['version','attr','add','名称=作者 键=other 值=x',...E], { envExtra: baseEnv });
  record('attr 名称重复被拒', attrNameDup.status!==0);
  const attrLong = cli(['version','attr','add',`名称=长值 键=lv 值=${'好'.repeat(141)}`,...E], { envExtra: baseEnv });
  record('attr 值>140 被拒', attrLong.status!==0);
  const attrSet = cli(['version','attr','set','键=author 值=全量二版',...E], { envExtra: baseEnv });
  record('version attr set', attrSet.status===0);
  const attrList = cli(['version','attr','list',...E], { envExtra: baseEnv });
  record('version attr list', attrList.status===0 && attrList.all.includes('author'));
  // option：RT006003 不支持
  const optAdd = cli(['version','option','add','名称=主题 键=theme 方式=文本 默认=dark',...E], { envExtra: baseEnv });
  record('RT006003 option add 被拒（类型不支持）', optAdd.status!==0 && optAdd.all.includes('不支持'));

  // dep add/range/rm/list（使用文档 04 依赖）
  log('\n--- 6b. 依赖 ---');
  // 非交互未指定 policy-id 应被要求
  const depNoPolicy = cli(['version','dep','add', dep0.resourceId, '--range','^1.0.0','--yes',...E], { envExtra: baseEnv });
  // 若对方已有授权，可能直接 pass；若未授权，0.5.3 要求 --policy-id
  const depNeedPolicy = depNoPolicy.status!==0 && depNoPolicy.all.includes('policy');
  if(depNeedPolicy){
    record('dep add 未给 policy-id 被要求', true);
    const depWithPolicy = cli(['version','dep','add', dep0.resourceId, '--range','^1.0.0','--policy-id', dep0.policyId, '--yes',...E], { envExtra: baseEnv });
    record('dep add --policy-id 成功', depWithPolicy.status===0);
  } else {
    record('dep add 未给 policy-id（已授权或无需）', depNoPolicy.status===0, depNoPolicy.out.slice(0,40));
    if(depNoPolicy.status!==0){
      const depWithPolicy = cli(['version','dep','add', dep0.resourceId, '--range','^1.0.0','--policy-id', dep0.policyId, '--yes',...E], { envExtra: baseEnv });
      record('dep add --policy-id 重试', depWithPolicy.status===0);
    }
  }
  const depBadRange = cli(['version','dep','add', dep0.resourceId, '--range','^9.0.0','--policy-id', dep0.policyId,'--yes',...E], { envExtra: baseEnv });
  record('dep 范围对不上被拒', depBadRange.status!==0);
  const depList = cli(['version','dep','list',...E], { envExtra: baseEnv });
  record('version dep list', depList.status===0 && depList.all.includes(dep0.resourceId.slice(0,8)));
  const depRange = cli(['version','dep','range', dep0.resourceId, '--range','^1.0.0','--yes',...E], { envExtra: baseEnv });
  record('version dep range', depRange.status===0 || depRange.all.includes('range'));
  const depRm = cli(['version','dep','rm', dep0.resourceId,'--yes',...E], { envExtra: baseEnv });
  record('version dep rm', depRm.status===0);
  const depRe = cli(['version','dep','add', dep0.resourceId,'--policy-id', dep0.policyId,'--yes',...E], { envExtra: baseEnv });
  record('version dep re-add 默认 ^latest', depRe.status===0);

  // 7. 发布新版本（使用文档 02 发布新版本）
  log('\n--- 7. update-version 发布新版本 ---');
  const updPatch = cli(['update-version','--bump','patch','--yes',...E], { envExtra: baseEnv });
  record('update-version --bump patch (1.0.1)', updPatch.status===0 && updPatch.all.includes('1.0.1'));
  const show101 = cli(['version','show',...E], { envExtra: baseEnv });
  record('线上 latest 1.0.1', show101.status===0 && show101.all.includes('1.0.1'));
  const updVersion = cli(['version','draft','pull','--yes',...E], { envExtra: baseEnv });
  record('draft pull 再发', updVersion.status===0);
  const updSpecific = cli(['update-version','--version','1.1.0','--yes',...E], { envExtra: baseEnv });
  record('update-version --version 1.1.0', updSpecific.status===0 && updSpecific.all.includes('1.1.0'));
  const updConflict = cli(['update-version','--version','1.2.0','--bump','patch','--yes',...E], { envExtra: baseEnv });
  record('--version 与 --bump 冲突被拒', updConflict.status!==0);
  const updOld = cli(['update-version','--version','1.0.0','--yes',...E], { envExtra: baseEnv });
  record('旧号被拒（必须 > latest）', updOld.status!==0);
  const updNoFile = cli(['update-version','--version','1.2.0','--artifact','not-exist.bin','--yes',...E], { envExtra: baseEnv });
  record('本地文件不在被拒', updNoFile.status!==0 && updNoFile.all.includes('不在'));
  // --reuse-version
  const pullOld = cli(['version','draft','pull','--version','1.0.1','--yes',...E], { envExtra: baseEnv });
  record('draft pull --version 1.0.1', pullOld.status===0);
  const reuse = cli(['update-version','--reuse-version','1.0.1','--version','1.2.0','--yes',...E], { envExtra: baseEnv });
  record('update-version --reuse-version 1.0.1 → 1.2.0', reuse.status===0 && reuse.all.includes('1.2.0'));
  const reset = cli(['update-version','--reset','--bump','patch','--yes',...E], { envExtra: baseEnv });
  record('update-version --reset --bump patch', reset.status===0);
  // version show --local 提交后无稿
  const noLocal = cli(['version','show','--local',...E], { envExtra: baseEnv });
  record('提交后 show --local 无稿', noLocal.status!==0);

  // 8. 资源管理（使用文档 05）
  log('\n--- 8. 资源管理 ---');
  const st = cli(['status',...E], { envExtra: baseEnv });
  record('status', st.status===0 && st.all.includes('latestVersion'));
  const verShowVer = cli(['version','show','--version','1.0.0',...E], { envExtra: baseEnv });
  record('version show --version 1.0.0', verShowVer.status===0);
  const polList = cli(['policy','list',...E], { envExtra: baseEnv });
  record('policy list', polList.status===0);
  const tplList2 = cli(['policy','template','list','--page','1','--page-size','5',...E], { envExtra: baseEnv });
  record('policy template list --page', tplList2.status===0);
  const polApply = cli(['policy','apply','--from-file', policyFreeJson, '--name','全量免费','--yes',...E], { envExtra: baseEnv });
  record('policy apply --from-file', polApply.status===0);
  const polList2 = cli(['policy','list',...E], { envExtra: baseEnv });
  record('policy list 有 on', polList2.status===0 && polList2.all.includes('on'));
  const updTitle = cli(['update','--title',`新标题-${tag}`,'--yes',...E], { envExtra: baseEnv });
  record('update --title', updTitle.status===0);
  const sync = cli(['resource','sync',...E], { envExtra: baseEnv });
  record('resource sync', sync.status===0);
  const updIntro = cli(['update','--intro','简介测试','--tags','a,b','--yes',...E], { envExtra: baseEnv });
  record('update --intro --tags', updIntro.status===0);
  const val = cli(['validate','--for','online','--yes',...E], { envExtra: baseEnv });
  record('validate --for online', val.status===0 && val.all.includes('可以上架'));
  const on = cli(['online','--yes',...E], { envExtra: baseEnv });
  record('online', on.status===0);
  const onAgain = cli(['online','--yes',...E], { envExtra: baseEnv });
  record('online 幂等', onAgain.status===0);
  const off = cli(['offline','--yes',...E], { envExtra: baseEnv });
  record('offline', off.status===0);

  // 9. 环境与凭据：resource sync 单资源、version set、type
  log('\n--- 9. 杂项 ---');
  const setArt = cli(['version','set','--artifact','video.mp4',...E], { envExtra: baseEnv });
  record('version set --artifact', setArt.status===0);
  const typeList = cli(['type','list',...E], { envExtra: baseEnv });
  record('type list', typeList.status===0);
  const typeSearch = cli(['type','search','视频',...E], { envExtra: baseEnv });
  // 0.5.3 search 恒空是已知问题，记录
  record('type search 视频', typeSearch.status===0, typeSearch.all.slice(0,40) || '空');
  const typeInfo = cli(['type','info','RT006003',...E], { envExtra: baseEnv });
  record('type info RT006003', typeInfo.status===0 && typeInfo.all.includes('RT006003'));
  const descOnline = cli(['version','description','--version','1.0.0','--description','补充说明',...E], { envExtra: baseEnv });
  record('version description 改已发号', descOnline.status===0);
  const stJson = cli(['status','--json',...E], { envExtra: baseEnv });
  let jsonOk=false; try{ JSON.parse(stJson.out); jsonOk=true; }catch{}
  // status --json 在有凭据时应输出正常 JSON，无凭据时输出 AUTH_REQUIRED
  record('status --json 可解析', stJson.status===0 && jsonOk, stJson.out.slice(0,60));

  // 10. 多资源工程（使用文档 按场景操作 场景二、场景七）
  log('\n--- 10. 多资源工程 ---');
  // 在同一 root 下再 create 第二份资源（不同短标识、不同产物）
  const shortName2 = `full2-${tag}`;
  const create2 = cli(['create','--title',`第二份-${tag}`,'--name',shortName2,'--type','RT005001','--artifact','cover.jpg','--yes',...E], { envExtra: baseEnv });
  record('同一目录 create 第二份资源', create2.status===0, create2.out.slice(0,40));
  resourceId2 = create2.out.trim().split('\n')[0]?.trim() || '';
  const twoJsons = readdirSync(path.join(root,'.freelog')).filter(f=>/^\d+\.json$/.test(f));
  record('存在 1.json 与 2.json', twoJsons.includes('1.json') && twoJsons.includes('2.json'));
  // 不带 --resource 时，多资源工程应提示选择或报错
  const noSel = cli(['status',...E], { envExtra: baseEnv });
  record('多资源不带 --resource 提示选择', noSel.status!==0 || noSel.all.includes('--resource'), noSel.all.slice(0,80));
  const st1 = cli(['status','--resource',`id:${resourceId1}`,...E], { envExtra: baseEnv });
  record('status --resource id: 第一份', st1.status===0 && st1.all.includes(resourceId1.slice(0,8)));
  const st2 = cli(['status','--resource',`name:${shortName2}`,...E], { envExtra: baseEnv });
  record('status --resource name: 第二份', st2.status===0);
  const stArt = cli(['status','--resource','artifact:video.mp4',...E], { envExtra: baseEnv });
  record('status --resource artifact:video.mp4', stArt.status===0);
  // 第二份发版（需 --resource）
  const prep2 = cli(['create-version','--prepare','--resource',`id:${resourceId2}`,...E], { envExtra: baseEnv });
  record('第二份 create-version --prepare --resource', prep2.status===0);
  const submit2 = cli(['create-version','--resource',`id:${resourceId2}`,'--yes',...E], { envExtra: baseEnv });
  record('第二份 create-version --yes', submit2.status===0 && submit2.all.includes('1.0.0'));
  // resource sync 批量
  const syncAll = cli(['resource','sync',...E], { envExtra: baseEnv });
  record('resource sync 批量', syncAll.status===0);
  const syncOne = cli(['resource','sync','--resource',`id:${resourceId1}`,...E], { envExtra: baseEnv });
  record('resource sync --resource id:', syncOne.status===0);

  // 11. 接入已有资源（bind）
  log('\n--- 11. bind 接入 ---');
  const bindDir = mkdtempSync(path.join(tmpdir(), 'pub053-bind-'));
  const bindLogin = cli(['login','--login-name',creds.loginName,'--password-stdin','--yes',...E], { cwd: bindDir, input: creds.password, envExtra: baseEnv });
  record('bind 前 login 新目录', bindLogin.status===0);
  copyFileSync(mediaVideo, path.join(bindDir,'video.mp4'));
  const bind = cli(['bind', resourceId1, '--artifact','video.mp4',...E], { cwd: bindDir, envExtra: baseEnv });
  record('bind 已有资源', bind.status===0);
  const bindShow = cli(['version','show',...E], { cwd: bindDir, envExtra: baseEnv });
  record('bind 后 version show', bindShow.status===0);
  rmSync(bindDir, { recursive:true, force:true });

  // 12. logout 后行为
  log('\n--- 12. logout ---');
  const lo = cli(['logout','--yes',...E], { envExtra: baseEnv });
  record('logout', lo.status===0);
  const afterOnline = cli(['online','--yes',...E], { envExtra: baseEnv });
  record('logout 后 online 被拦', afterOnline.status!==0 && afterOnline.all.includes('login'));
  const afterShow = cli(['version','show',...E], { envExtra: baseEnv });
  record('logout 后 version show 被拦', afterShow.status!==0 && afterShow.all.includes('login'));

} finally {
  // 清理：保留 root 供人工复核？本次直接清理
  rmSync(root, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
}

log('\n=== 汇总 ===');
let ok=0; for(const r of results){ log(`${r.pass?'✔':'✘'} ${r.name}${r.note?` —— ${r.note}`:''}`); if(r.pass) ok+=1; }
log(`共 ${results.length}，通过 ${ok}，失败 ${results.length-ok}`);
appendFileSync(reportPath, lines.join('\n')+'\n\n','utf8');
log(`报告: ${reportPath}`);
if(results.some(r=>!r.pass)) process.exitCode=1;
