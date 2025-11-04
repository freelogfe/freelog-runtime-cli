const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const apiClient = require('../../core/api');
const { requireAuth, getCurrentAuth } = require('../../core/auth');
const { readConfig, updateConfig } = require('../../core/config');
const { logOperation, logError } = require('../../core/logger');
const { FreelogError } = require('../../core/errors');
const { selectVersion } = require('../../utils/version-selector');

/**
 * 解析资源标识符
 */
function parseResource(resource) {
  // URL 格式
  if (resource.startsWith('http://') || resource.startsWith('https://')) {
    const match = resource.match(/\/resource\/([^@\s]+)(@(.+))?/);
    if (match) {
      return {
        value: match[1],
        version: match[3] || 'latest',
        type: 'id'
      };
    }
  }

  // resource@version 格式
  if (resource.includes('@')) {
    const [value, version] = resource.split('@');
    return {
      value,
      version: version || 'latest',
      type: value.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
    };
  }

  // 纯 ID 或名称
  return {
    value: resource,
    version: 'latest',
    type: resource.match(/^[0-9a-f]{24}$/i) ? 'id' : 'name'
  };
}

/**
 * 查找现有依赖
 */
function findExistingDependency(config, resourceId, resourceName) {
  return config.dependencies.find(dep => 
    dep.resourceId === resourceId || 
    dep.resourceName === resourceName ||
    dep.name === resourceName
  );
}

/**
 * 修改依赖 - 合约应用修改
 */
async function modifyByContract(existingDep, targetVersion, resourceInfo) {
  console.log(chalk.blue('ℹ ') + '使用合约应用修改方式');
  
  // 询问是否修改版本
  const { confirmVersion } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmVersion',
      message: `是否修改版本? (当前: ${existingDep.version} -> 目标: ${targetVersion})`,
      default: targetVersion !== existingDep.version
    }
  ]);

  if (confirmVersion) {
    existingDep.version = targetVersion;
    console.log(chalk.green('✔ ') + `版本已更新: ${targetVersion}`);
  }

  // 询问是否修改上抛
  const { modifyUpcast } = await inquirer.prompt([
    {
      type: 'list',
      name: 'modifyUpcast',
      message: '是否修改上抛设置?',
      choices: [
        { name: '保持不变', value: 'keep' },
        { name: '修改为上抛', value: 'upcast' },
        { name: '修改为不上抛', value: 'no-upcast' }
      ]
    }
  ]);

  if (modifyUpcast === 'upcast') {
    existingDep.versionRange = 'latest';
    console.log(chalk.blue('ℹ ') + '已设置为上抛');
  } else if (modifyUpcast === 'no-upcast') {
    delete existingDep.versionRange;
    console.log(chalk.blue('ℹ ') + '已取消上抛');
  }

  return existingDep;
}

/**
 * 修改依赖 - 重新签约
 */
async function modifyByResign(existingDep, targetVersion, resourceInfo, auth) {
  console.log(chalk.blue('ℹ ') + '重新选择策略签约');
  
  // 获取策略列表
  let policySpinner = ora('正在获取策略列表...');
  let policies;
  
  try {
    policies = await getPolicies(resourceInfo.resourceId);
    spinner.succeed(`找到 ${policies.length} 个可用策略`);
    policySpinner = null;
  } catch (err) {
    if (policySpinner) {
      spinner.fail('获取策略列表失败');
      policySpinner = null;
    }
    throw err;
  }

  if (policies.length === 0) {
    console.log(chalk.yellow('⚠ ') + '没有可用的策略');
    return null;
  }

  // 选择策略
  console.log('\n可用策略:');
  const policyChoices = policies.map(p => ({
    name: `${p.policyName} - ${p.description || '无描述'}${p.price ? ` (${p.price}元)` : ' (免费)'}`,
    value: p.policyId,
    short: p.policyName
  }));

  const { selectedPolicyId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedPolicyId',
      message: '请选择新的策略:',
      choices: policyChoices
    }
  ]);

  const selectedPolicy = policies.find(p => p.policyId === selectedPolicyId);

  // 显示策略详情
  console.log('\n策略详情:');
  console.log(`  名称: ${selectedPolicy.policyName}`);
  console.log(`  费用: ${selectedPolicy.price ? `${selectedPolicy.price} 元` : '免费'}`);
  console.log(`  说明: ${selectedPolicy.description || '无'}`);
  console.log();

  // 确认签约
  const { confirmSign } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmSign',
      message: '确认签约此策略?',
      default: true
    }
  ]);

  if (!confirmSign) {
    console.log(chalk.blue('ℹ ') + '已取消签约');
    return null;
  }

  // 执行签约
  let signSpinner = ora('正在签约...');
  let authStatus = false;
  let policyId = selectedPolicyId;

  try {
    const contractResult = await signContract(selectedPolicyId, {
      resourceId: resourceInfo.resourceId,
      version: targetVersion
    });

    spinner.succeed('签约成功');
    signSpinner = null;

    const contractId = contractResult.contractId;

    // 检查授权状态
    console.log(chalk.blue('ℹ ') + '正在检查授权状态...');
    const checkSpinner = ora('正在验证授权...');

    try {
      const authCheckResponse = await apiClient.get(`/v2/resources/${resourceInfo.resourceId}`);
      const authInfo = authCheckResponse.data.data;

      const isAuthorized = authInfo.authStatus === 'authorized' || authInfo.status === 2;

      spinner.succeed('授权状态检查完成');

      if (isAuthorized) {
        authStatus = true;
        console.log(chalk.green('✔ ') + '✓ 已获得授权');
      } else {
        console.log(chalk.yellow('⚠ ') + '未获得授权，需要支付费用');

        // 处理支付逻辑（如果需要）
        if (selectedPolicy.price && selectedPolicy.price > 0) {
          console.log('\n支付信息:');
          console.log(`  合约ID: ${contractId}`);
          console.log(`  资源: ${resourceInfo.resourceName}`);
          console.log(`  费用: ${selectedPolicy.price} 元`);
          console.log(`  策略: ${selectedPolicy.policyName}`);
          console.log();

          const { confirmPay } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmPay',
              message: '是否立即支付?',
              default: true
            }
          ]);

          if (confirmPay) {
            const paymentInfo = await inquirer.prompt([
              {
                type: 'input',
                name: 'accountId',
                message: '请输入付款账户ID:',
                validate: input => input.trim() ? true : '账户ID不能为空'
              },
              {
                type: 'password',
                name: 'password',
                message: '请输入支付密码（6位数字）:',
                mask: '*',
                validate: input => {
                  if (!input) return '支付密码不能为空';
                  if (!/^\d{6}$/.test(input)) return '支付密码必须是6位数字';
                  return true;
                }
              }
            ]);

            let paySpinner = ora('正在处理支付...');

            try {
              const paymentResult = await apiClient.post(`/v2/contracts/${contractId}/payment-events`, {
                eventId: `pay_${Date.now()}`,
                accountId: paymentInfo.accountId,
                transactionAmount: selectedPolicy.price,
                password: paymentInfo.password
              });

              if (paymentResult.data.status === 2) {
                spinner.succeed('支付成功');
                paySpinner = null;
                authStatus = true;
                console.log(chalk.green('✔ ') + '✓ 已获得授权');
              } else {
                if (paySpinner) {
                  spinner.fail('支付失败');
                  paySpinner = null;
                }
                console.log(chalk.yellow('⚠ ') + '支付未成功');
                authStatus = false;
              }
            } catch (payErr) {
              if (paySpinner) {
                spinner.fail('支付失败');
                paySpinner = null;
              }
              console.log(chalk.red('✖ ') + `支付错误: ${payErr.message}`);
              authStatus = false;
            }
          } else {
            console.log(chalk.blue('ℹ ') + '跳过支付');
            authStatus = false;
          }
        }
      }
    } catch (checkErr) {
      if (checkSpinner) {
        spinner.fail('授权检查失败');
      }
      console.log(chalk.yellow('⚠ ') + `无法验证授权状态: ${checkErr.message}`);
      authStatus = false;
    }
  } catch (err) {
    if (signSpinner) {
      spinner.fail('签约失败');
      signSpinner = null;
    }
    throw err;
  }

  // 更新依赖信息
  existingDep.version = targetVersion;
  existingDep.policyId = policyId;
  existingDep.policyName = selectedPolicy.policyName;
  existingDep.authStatus = authStatus;

  return existingDep;
}

/**
 * 执行修改依赖命令
 */
async function executeChange(resource, options) {
  try {
    // 1. 登录检查
    requireAuth();
    const auth = getCurrentAuth();

    logOperation('change_dependency', { resource, options });

    console.log(`\n正在修改依赖: ${resource}\n`);

    // 2. 解析资源标识符
    const parsed = parseResource(resource);
    let targetVersion = parsed.version;

    // 3. 获取资源信息
    let spinner = ora('正在获取资源信息...');
    let resourceInfo;

    try {
      const response = await apiClient.get(`/v2/resources/${parsed.value}`);
      if (!response || !response.data || !response.data.data) {
        throw new Error('资源信息获取失败');
      }
      resourceInfo = response.data.data;
      spinner.succeed('资源信息获取成功');
      spinner = null;

      console.log(chalk.green('✔ ') + `资源名称: ${resourceInfo.resourceName}`);
      console.log(chalk.green('✔ ') + `资源类型: ${Array.isArray(resourceInfo.resourceType) ? resourceInfo.resourceType.join(', ') : resourceInfo.resourceType}`);
      console.log(chalk.blue('ℹ ') + `描述: ${resourceInfo.intro || '无'}`);
    } catch (err) {
      if (spinner) {
        spinner.fail('资源信息获取失败');
        spinner = null;
      }
      console.log(chalk.red('✖ ') + err.message);
      logError(err);
      process.exit(1);
    }
    
    // 3.5 如果指定了 --select-version，交互式选择版本
    if (options.selectVersion) {
      const selectedVersion = await selectVersion(
        resourceInfo.resourceId || resourceInfo._id,
        resourceInfo.resourceName
      );
      
      if (selectedVersion === null) {
        console.log(chalk.blue('ℹ ') + '已取消修改依赖');
        process.exit(0);
      }
      
      targetVersion = selectedVersion;
      console.log(chalk.green('✔ ') + `已选择版本: ${targetVersion}`);
    }

    // 4. 读取配置并查找现有依赖
    const config = readConfig(process.cwd(), true);
    const existingDep = findExistingDependency(
      config,
      resourceInfo.resourceId || resourceInfo._id,
      resourceInfo.resourceName
    );

    if (!existingDep) {
      console.log(chalk.red('✖ ') + '依赖不存在于配置文件中');
      console.log(chalk.blue('ℹ ') + '提示: 使用 freelog-cli add 命令添加新依赖');
      process.exit(1);
    }

    // 5. 显示当前依赖信息
    console.log('\n当前依赖信息:');
    console.log(`  资源名称: ${existingDep.resourceName || existingDep.name}`);
    console.log(`  当前版本: ${existingDep.version}`);
    console.log(`  策略: ${existingDep.policyName || '未知'}`);
    console.log(`  授权状态: ${existingDep.authStatus ? '✓ 已授权' : '✗ 未授权'}`);
    if (targetVersion !== existingDep.version) {
      console.log(`  目标版本: ${targetVersion}`);
    }
    console.log();

    // 6. 选择修改方式
    const { modifyType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'modifyType',
        message: '请选择修改方式:',
        choices: [
          { name: '合约应用修改（修改版本、上抛设置等）', value: 'contract' },
          { name: '重新选择策略签约（重新签约并支付）', value: 'resign' }
        ]
      }
    ]);

    // 7. 执行修改
    let updatedDep;

    if (modifyType === 'contract') {
      updatedDep = await modifyByContract(existingDep, targetVersion, resourceInfo);
    } else {
      updatedDep = await modifyByResign(existingDep, targetVersion, resourceInfo, auth);
    }

    if (!updatedDep) {
      console.log(chalk.yellow('⚠ ') + '修改已取消');
      process.exit(0);
    }

    // 8. 保存配置
    let saveSpinner = ora('正在保存配置...');

    try {
      // 更新依赖列表中的对应项
      const depIndex = config.dependencies.findIndex(dep =>
        dep.resourceId === existingDep.resourceId ||
        dep.resourceName === existingDep.resourceName ||
        dep.name === existingDep.name
      );

      if (depIndex !== -1) {
        config.dependencies[depIndex] = updatedDep;
      }

      updateConfig(config);

      spinner.succeed('配置保存成功');
      saveSpinner = null;

      console.log(chalk.green('✔ ') + `依赖修改成功: ${updatedDep.resourceName || updatedDep.name}@${updatedDep.version}`);

      logOperation('change_success', {
        resource: updatedDep.resourceName || updatedDep.name,
        version: updatedDep.version,
        modifyType
      });
    } catch (err) {
      if (saveSpinner) {
        spinner.fail('保存配置失败');
        saveSpinner = null;
      }
      console.log(chalk.red('✖ ') + err.message);
      logError(err);
      process.exit(1);
    }

  } catch (err) {
    console.log(chalk.red('✖ ') + `执行修改依赖命令失败: ${err.message}`);
    logError(err);
    process.exit(1);
  }
}

module.exports = executeChange;

