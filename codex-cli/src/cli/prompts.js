import inquirer from 'inquirer';

function ensureInteractive() {
  if (!process.stdin.isTTY) {
    throw new Error('当前终端不支持交互输入，请通过命令行参数提供所需值。');
  }
}

export async function promptInput(message, { defaultValue = '' } = {}) {
  ensureInteractive();
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue
    }
  ]);
  return answer.value?.trim() ?? '';
}

export async function promptPassword(message) {
  ensureInteractive();
  const answer = await inquirer.prompt([
    {
      type: 'password',
      name: 'value',
      message,
      mask: '*'
    }
  ]);
  return answer.value ?? '';
}

export async function promptSelect(message, options) {
  ensureInteractive();
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error('没有可供选择的选项。');
  }
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message,
      choices: options.map((option) =>
        typeof option === 'string'
          ? { name: option, value: option }
          : { name: option.label ?? option.value, value: option.value ?? option.label }
      )
    }
  ]);
  return answer.value;
}
