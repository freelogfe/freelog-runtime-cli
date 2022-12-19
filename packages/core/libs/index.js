const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const program = require('commander');
const colors = require('colors/safe');
const userHome = require('user-home');
const semver = require('semver');
const { log, npm, Package, exec, locale } = require('@freelog-cli/utils');
const packageConfig = require('../package');
const compressing = require('compressing');
const FormData = require('form-data')
const axios = require('axios')
const add = require('@freelog-cli/add')
const AdmZip = require('adm-zip');

const {
  LOWEST_NODE_VERSION,
  DEFAULT_CLI_HOME,
  NPM_NAME,
  DEPENDENCIES_PATH,
} = require('../libs/const');

module.exports = cli;

let args;
let config;

async function cli() {
  try {
    await prepare();
    registerCommand();
  } catch (e) {
    log.error(e.message);
  }
}

function registerCommand() {
  program.version(packageConfig.version).usage('<command> [options]');


  program
    .command('add')
    .description('添加内容')
    .action(add)

  program
    .command('init [type]')
    .description('项目初始化')
    .option('--packagePath <packagePath>', '手动指定init包路径')
    .option('--force', '覆盖当前路径文件（谨慎使用）')
    .action(async (type, { packagePath, force }) => {
      const packageName = '@freelog-cli/init';
      const packageVersion = '1.0.3';
      log.success('欢迎学习', packageName);
      await execCommand({ packagePath, packageName, packageVersion }, { type, force });
    });
  program
    .command('login')
    .description('登录')
    .option('-u, --username  <username>', '用户名')
    .option('-p, --password <password>', '密码')
    .action(async ({
      username,
      password
    }) => {

      log.notice('欢迎学习', process.cwd(), username, password);
      axios({
        url: 'http://localhost:3000/user/login',
        method: 'POST',
        data: {
          username,
          password
        },
      }).then(res => {
        console.log(res.data)
        // 文件系统模块执行文件操作
        const fs = require('fs');

        const jsonData = '{"persons":[{"name":"John","city":"New York"},{"name":"Phil","city":"Ohio"}]}';

        const jsonObj = JSON.parse(jsonData);

        const jsonContent = JSON.stringify(jsonObj);

        console.log(jsonContent);
        fs.writeFile(config.cliHome + path.sep + "token.json", jsonContent, 'utf8', function (err) {
          if (err) {
            console.log("An error occured while writing JSON Object to File.");
            return console.log(err);
          }
          console.log("JSON file has been saved.");
        });
      })
    });
  program
    .command('publish')
    .description('项目发布')
    .option('--packagePath <packagePath>', '手动指定publish包路径')
    .action(async ({
      packagePath
    }) => {
      let userInfo
      // 登录检查
      fs.readFile(config.cliHome + path.sep + "token.json", 'utf8', (err, userData) => {
        log.notice(1111, userData)
        if (err || !userData) {
          log.error('请使用freelog-cli login 登录后重试', err)
          return
        }
        try {
          userInfo = JSON.parse(userData)

        } catch (error) {
          log.error(error)
        }
        // 读取 packageJson 文件
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        fs.readFile(packageJsonPath, 'utf8', async (err, data) => {
          if (err) {
            log.error(err)
            return
          }
          let packageJson = JSON.parse(data)
          // 获取publish路径,如果没有默认dist
          const buildPath = path.resolve(process.cwd(), packageJson.publishPath || 'dist');
          // 如果不存在
          if (!fs.existsSync(buildPath)) {
            log.error(buildPath + ' 打包路径不存在')
            return
          }
          // 资源id检查
          if (!packageJson.workId) {
            log.error('workId不存在,请检查package.json')
            return
          }
          // 临时文件目录
          const target = path.resolve(config.cliHome, 'temp');
          if (!fs.existsSync(target)) {
            fs.mkdirSync(target);
          }
          const file = new AdmZip();
          const pa = fs.readdirSync(buildPath);
          pa.forEach(function (ele, index) {
            const info = fs.statSync(buildPath + path.sep + ele)
            if (info.isDirectory()) {
              file.addLocalFolder(buildPath + path.sep + ele, ele)
            } else {
              file.addLocalFile(buildPath + path.sep + ele)
            }
          })
          // 生成压缩目录与名称，使用packageJson下的name
          const zipFile = target + path.sep + packageJson.name + '.zip'
          fs.writeFileSync(zipFile, file.toBuffer());
          // // 压缩文件结束后上传 
          log.notice('压缩结束', buildPath, userInfo);
          let formData = new FormData();
          let zip = fs.createReadStream(zipFile)    // 根目录下需要有一个test.jpg文件
          formData.append('zip', zip);
          formData.append('userInfo', userData)
          let len = await new Promise((resolve, reject) => {
            return formData.getLength((err, length) => (err ? reject(err) : resolve(length)));
          });
          axios({
            url: 'http://localhost:3000/publish',
            method: 'POST',
            // params: {
            //   access_token: 'ACCESS_TOKEN', 
            //   type: 'zip',   
            // },
            data: formData,
            headers: {
              ...formData.getHeaders(),
              'Content-Length': len,
            },
          }).then(res => {
            console.log(res)
            // 未登录逻辑
          })
        });
      })

    });

  program
    .command('replace')
    .description('作业网站优化')
    .option('--packagePath <packagePath>', '手动指定replace包路径')
    .option('--region <region>', 'oss region')
    .option('--bucket <bucket>', 'oss bucket')
    .option('--ossAccessKey <ossAccessKey>', 'oss accessKey')
    .option('--ossSecretKey <ossSecretKey>', 'oss secretKey')
    .action(async ({ packagePath, region, bucket, ossAccessKey, ossSecretKey }) => {
      const packageName = '@freelog-cli/replace';
      const packageVersion = '1.0.0';
      await execCommand({ packagePath, packageName, packageVersion }, { region, bucket, ossAccessKey, ossSecretKey });
    });

  program
    .command('clean')
    .description('清空缓存文件')
    .option('-a, --all', '清空全部')
    .option('-d, --dep', '清空依赖文件')
    .action((options) => {
      log.notice('开始清空缓存文件');
      if (options.all) {
        cleanAll();
      } else if (options.dep) {
        const depPath = path.resolve(config.cliHome, DEPENDENCIES_PATH);
        if (fs.existsSync(depPath)) {
          fse.emptyDirSync(depPath);
          log.success('清空依赖文件成功', depPath);
        } else {
          log.success('文件夹不存在', depPath);
        }
      } else {
        cleanAll();
      }
    });

  program
    .option('--debug', '打开调试模式')
    .parse(process.argv);

  if (args._.length < 1) {
    program.outputHelp();
    console.log();
  }
}

async function execCommand({ packagePath, packageName, packageVersion }, extraOptions) {
  let rootFile;
  try {
    if (packagePath) {
      const execPackage = new Package({
        targetPath: packagePath,
        storePath: packagePath,
        name: packageName,
        version: packageVersion,
      });
      rootFile = execPackage.getRootFilePath(true);
    } else {
      const { cliHome } = config;
      const packageDir = `${DEPENDENCIES_PATH}`;
      const targetPath = path.resolve(cliHome, packageDir);
      const storePath = path.resolve(targetPath, 'node_modules');
      const initPackage = new Package({
        targetPath,
        storePath,
        name: packageName,
        version: packageVersion,
      });
      if (await initPackage.exists()) {
        await initPackage.update();
      } else {
        await initPackage.install();
      }
      rootFile = initPackage.getRootFilePath();
    }
    const _config = Object.assign({}, config, extraOptions, {
      debug: args.debug,
    });
    if (fs.existsSync(rootFile)) {
      const code = `require('${rootFile}')(${JSON.stringify(_config)})`;
      const p = exec('node', ['-e', code], { 'stdio': 'inherit' });
      p.on('error', e => {
        log.verbose('命令执行失败:', e);
        handleError(e);
        process.exit(1);
      });
      p.on('exit', c => {
        log.verbose('命令执行成功:', c);
        process.exit(c);
      });
    } else {
      throw new Error('入口文件不存在，请重试！');
    }
  } catch (e) {
    log.error(e.message);
  }
}

function handleError(e) {
  if (args.debug) {
    log.error('Error:', e.stack);
  } else {
    log.error('Error:', e.message);
  }
  process.exit(1);
}

function cleanAll() {
  if (fs.existsSync(config.cliHome)) {
    fse.emptyDirSync(config.cliHome);
    log.success('清空全部缓存文件成功', config.cliHome);
  } else {
    log.success('文件夹不存在', config.cliHome);
  }
}

async function prepare() {
  checkPkgVersion(); // 检查当前运行版本
  checkNodeVersion(); // 检查 node 版本
  checkRoot(); // 检查是否为 root 启动
  checkUserHome(); // 检查用户主目录
  checkInputArgs(); // 检查用户输入参数
  checkEnv(); // 检查环境变量
  await checkGlobalUpdate(); // 检查工具是否需要更新
}

async function checkGlobalUpdate() {
  log.verbose('检查 freelog-cli 最新版本');
  const currentVersion = packageConfig.version;
  const lastVersion = await npm.getNpmLatestSemverVersion(NPM_NAME, currentVersion);
  if (lastVersion && semver.gt(lastVersion, currentVersion)) {
    log.warn(colors.yellow(`请手动更新 ${NPM_NAME}，当前版本：${packageConfig.version}，最新版本：${lastVersion}
                更新命令： npm install -g ${NPM_NAME}`));
  }
}

function checkEnv() {
  log.verbose('开始检查环境变量');
  const dotenv = require('dotenv');
  dotenv.config({
    path: path.resolve(userHome, '.env'),
  });
  config = createCliConfig(); // 准备基础配置
  log.verbose('环境变量', config);
}

function createCliConfig() {
  const cliConfig = {
    home: userHome,
  };
  if (process.env.CLI_HOME) {
    cliConfig['cliHome'] = path.join(userHome, process.env.CLI_HOME);
  } else {
    cliConfig['cliHome'] = path.join(userHome, DEFAULT_CLI_HOME);
  }
  return cliConfig;
}

function checkInputArgs() {
  log.verbose('开始校验输入参数');
  const minimist = require('minimist');
  args = minimist(process.argv.slice(2)); // 解析查询参数
  checkArgs(args); // 校验参数
  log.verbose('输入参数', args);
}

function checkArgs(args) {
  if (args.debug) {
    process.env.LOG_LEVEL = 'verbose';
  } else {
    process.env.LOG_LEVEL = 'info';
  }
  log.level = process.env.LOG_LEVEL;
}

function checkUserHome() {
  if (!userHome || !fs.existsSync(userHome)) {
    throw new Error(colors.red('当前登录用户主目录不存在！'));
  }
}

function checkRoot() {
  const rootCheck = require('root-check');
  rootCheck(colors.red('请避免使用 root 账户启动本应用'));
}

function checkNodeVersion() {
  const semver = require('semver');
  if (!semver.gte(process.version, LOWEST_NODE_VERSION)) {
    throw new Error(colors.red(`freelog-cli 需要安装 v${LOWEST_NODE_VERSION} 以上版本的 Node.js`));
  }
}

function checkPkgVersion() {
  log.notice('cli', packageConfig.version);
  log.success(locale.welcome);
}
