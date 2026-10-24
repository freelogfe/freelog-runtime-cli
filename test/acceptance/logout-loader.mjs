/** Resolve before the native package is imported; no native binding is loaded. */
export function resolve(specifier, context, nextResolve) {
  if (specifier === '@napi-rs/keyring') return { url: new URL('./logout-keyring.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@napi-rs/keyring')) throw new Error('Native credential subpaths are forbidden in logout validation.');
  return nextResolve(specifier, context);
}
