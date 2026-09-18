/** Console / CLI 共用：资源冻结状态 (status & 2) === 2 */
export function isFrozenStatus(status: number | undefined): boolean {
  if (status === undefined || status === null) return false;
  const n = Number(status);
  return n === 2 || (n & 2) === 2;
}
