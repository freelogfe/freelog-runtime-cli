function requireSafeEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少 ${name}；真实环境验证凭据只能通过环境变量提供`);
  }
  if (!/^[\w@.+-]+$/.test(value)) {
    throw new Error(`${name} 包含脚本命令不支持的字符`);
  }
  return value;
}

export function verificationAccount(kind = 'primary') {
  const prefix = kind === 'secondary' ? 'FREELOG_TEST_SECONDARY_' : 'FREELOG_TEST_';
  return {
    name: requireSafeEnv(`${prefix}LOGIN_NAME`),
    password: requireSafeEnv(`${prefix}PASSWORD`),
  };
}

export function verificationLoginArgs(kind = 'primary') {
  const account = verificationAccount(kind);
  return `login --login-name ${account.name} --password ${account.password} --yes`;
}
