/** Replace native keyring before its binding can load; only the login fixture is allowed. */
export function resolve(specifier, context, nextResolve) {
  if (specifier === '@napi-rs/keyring') return { url: new URL('./account-login-keyring.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@napi-rs/keyring')) throw new Error('Native keyring subpaths are forbidden in login validation.');
  return nextResolve(specifier, context);
}
