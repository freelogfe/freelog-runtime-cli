/** Classify only a normally completed, exact type-info row; failures never imply backend capability. */
export function classifyTypeCapability(result, expectedCode) {
  if (result?.completed !== true || result?.status !== 0 || result?.ok !== true) {
    return { status: 'FAIL', reason: 'type info 未正常成功完成，不能判断可选配置能力。' };
  }
  const row = /^([^\t\r\n]+)\t([^\t\r\n]+)\t可选配置：(支持|不支持)$/u.exec(String(result.output ?? '').trim());
  if (!row || row[1] !== expectedCode) {
    return { status: 'FAIL', reason: 'type info 返回类型编号或能力行格式无法核验。' };
  }
  return row[3] === '支持' ? { status: 'PASS' }
    : { status: 'BLOCKED', reason: `${expectedCode} 正常读回“可选配置：不支持”，当前样本不满足完整表单验收前置。` };
}
