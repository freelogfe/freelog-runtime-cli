export function isInteractive(yes?: boolean): boolean {
  if (yes) return false;
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export function wantsJson(json?: boolean): boolean {
  return Boolean(json);
}
