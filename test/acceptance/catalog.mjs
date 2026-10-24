/** Approved acceptance obligations, not a coverage percentage inferred from script exits. */
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandParameterCases } from './command-parameter-cases.mjs';
import { versionLifecycleCases } from './version-lifecycle-evidence.mjs';
import { resourceSyncCases } from './resource-sync-evidence.mjs';
import { resourceManagementCases } from './resource-management-evidence.mjs';
import { consoleRoundtripCases } from './console-roundtrip-evidence.mjs';
import { collectionLifecycleCases } from './collection-lifecycle-evidence.mjs';
import { collectionRecoveryCases } from './collection-recovery-evidence.mjs';
import { collectionItemsCases } from './collection-items-evidence.mjs';
import { collectionSelectionCases } from './collection-selection-evidence.mjs';
import { collectionEditCases } from './collection-edit-evidence.mjs';
import { collectionIdentityCases } from './collection-identity-evidence.mjs';
import { collectionRulesCases } from './collection-rules-evidence.mjs';
import { collectionPublishPreflightCases } from './collection-publish-preflight-evidence.mjs';
import { collectionPublishPreviewCases } from './collection-publish-preview-evidence.mjs';
import { accountLoginCases } from './account-login-evidence.mjs';

const testRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const nonempty = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;

export const legacyScripts = Object.freeze([
  'run-all-scenarios.mjs', 'verify-commands.mjs', 'verify-collection-policy.mjs',
  'verify-policy-template-tty.mjs', 'verify-scenarios.mjs', 'verify-field-rules.mjs',
  'verify-dependency-declarations.mjs', 'verify-collection-dependency-declarations.mjs',
  'verify-paid-declaration.mjs', 'run-resource-pool-scenarios.mjs', 'verify-optional-config.mjs',
  'verify-theme-image-full-lifecycle.mjs', 'verify-multi-resource-tty.mjs', 'verify-draft-safety.mjs',
]);

const uncovered = [
  ['COMMAND.PARAMETER_CONTRACT', 'All approved commands, parameter equivalence classes, conflicts and shared flags', ['command-matrix', 'input-boundaries', 'state-transitions']],
  ['VERSION.UPDATE_MATRIX', 'First release and updates after pull/bind/file replacement for ordinary files, themes and plugins', ['first-release', 'pull-inheritance', 'artifact-replacement', 'bind-update', 'plugin-update']],
  ['RESOURCE.MANAGEMENT_MATRIX', 'Resource selection, metadata, policies, shelf management and recovery with precise local/remote readback', ['selection', 'metadata', 'policies', 'shelf', 'recovery']],
  ['COLLECTION.MANAGEMENT_MATRIX', 'Collection first release and post-release items, dependencies, form, policies and directory changes', ['first-release', 'items', 'dependencies', 'management', 'failure-boundaries']],
  ['INTEROP.CLI_TO_CONSOLE', 'CLI-created and updated fields can be displayed and edited in the real Console', ['browser-first-version', 'browser-updated-version', 'browser-save']],
  ['INTEROP.CONSOLE_TO_CLI', 'Console-created and updated fields survive CLI pull and subsequent update', ['browser-create', 'cli-pull', 'cli-update', 'remote-exact-readback']],
  ['PLATFORM.SUPPORTED_MATRIX', 'Supported operating systems and Node versions have fresh installation and TTY evidence', ['windows', 'macos', 'linux', 'minimum-node', 'development-node']],
];

export const acceptanceCatalog = Object.freeze([
  ...legacyScripts.map((script) => Object.freeze({
    id: `LEGACY.${script.replace(/\.mjs$/u, '')}`, kind: 'legacy-suite', script, required: true,
    title: `${script}: process completion only, not exhaustive product coverage`,
    assertionIds: Object.freeze(['process-completed']),
  })),
  ...uncovered.map(([id, title, assertionIds]) => Object.freeze({
    id, kind: 'product-case', required: true, title,
    assertionIds: Object.freeze(assertionIds),
    gap: 'Required dedicated case evidence is not yet implemented; legacy script success cannot satisfy this obligation.',
  })),
  Object.freeze({ id: 'POLICY.COLLECTION.SELECTED_TEMPLATES', kind: 'product-case', required: true,
    title: 'Every selected collection policy template retains its outcome; success of other templates cannot erase a failure',
    assertionIds: Object.freeze(['all-selected-created', 'all-selected-read-back', 'policy-off-on']),
    script: 'verify-collection-policy.mjs' }),
  Object.freeze({ id: 'POLICY.TTY.REAL_PAGINATION', kind: 'product-case', required: true,
    title: 'Real dev policy template catalog permits testing next/previous page and cancellation without remote writes',
    assertionIds: Object.freeze(['second-page-available', 'next-page', 'previous-page', 'cancel-no-write']),
    script: 'verify-policy-template-tty.mjs' }),
  ...commandParameterCases,
  ...accountLoginCases,
  ...versionLifecycleCases,
  ...resourceSyncCases,
  ...resourceManagementCases,
  ...consoleRoundtripCases,
  ...collectionLifecycleCases,
  ...collectionRecoveryCases,
  ...collectionItemsCases,
  ...collectionSelectionCases,
  ...collectionEditCases,
  ...collectionIdentityCases,
  ...collectionRulesCases,
  ...collectionPublishPreflightCases,
  ...collectionPublishPreviewCases,
]);

/** Catalog edits change the trusted contract; unknown kinds never get a weaker validator. */
export function validateCatalog(catalog = acceptanceCatalog, root = testRoot) {
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('Acceptance catalog is empty or invalid.');
  const ids = new Set();
  for (const item of catalog) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !nonempty(item.id) || ids.has(item.id)
      || !nonempty(item.title) || typeof item.required !== 'boolean'
      || !['legacy-suite', 'product-case'].includes(item.kind)
      || !Array.isArray(item.assertionIds) || item.assertionIds.length === 0
      || item.assertionIds.some((id) => !nonempty(id)) || new Set(item.assertionIds).size !== item.assertionIds.length) {
      throw new Error(`Malformed/duplicate acceptance descriptor: ${item?.id ?? '<missing>'}`);
    }
    ids.add(item.id);
    if (Object.hasOwn(item, 'gap') && (item.kind !== 'product-case' || !nonempty(item.gap))) {
      throw new Error(`Invalid acceptance gap: ${item.id}`);
    }
    if (item.kind === 'legacy-suite') {
      if (!legacyScripts.includes(item.script) || item.id !== `LEGACY.${item.script.replace(/\.mjs$/u, '')}`
        || item.assertionIds.length !== 1 || item.assertionIds[0] !== 'process-completed') {
        throw new Error(`Invalid legacy acceptance descriptor: ${item.id}`);
      }
    } else if (item.id.startsWith('LEGACY.')) throw new Error(`Business case cannot impersonate legacy evidence: ${item.id}`);
    if (!item.gap && item.script === undefined) throw new Error(`Missing acceptance producer: ${item.id}`);
    if (item.script !== undefined) {
      if (typeof item.script !== 'string' || !/^[a-z][a-z0-9-]*\.mjs$/u.test(item.script)) {
        throw new Error(`Invalid acceptance producer: ${item.id}`);
      }
      const file = path.join(root, item.script);
      let regular = false;
      try { regular = lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file; } catch { /* explicit contract error below */ }
      if (!regular) throw new Error(`Missing/nonregular acceptance producer: ${item.id}`);
    }
  }
  return catalog;
}

/** One process can produce several cases; only the original legacy descriptors mean process coverage. */
export function acceptanceScripts(catalog = acceptanceCatalog, root = testRoot) {
  validateCatalog(catalog, root);
  return [...new Set(catalog.filter((item) => item.script !== undefined).map((item) => item.script))];
}

export function manifestSha256() {
  validateCatalog();
  return createHash('sha256').update(JSON.stringify(acceptanceCatalog)).digest('hex');
}

export function initialCases() {
  validateCatalog();
  return acceptanceCatalog.map((item) => ({
    id: item.id, status: 'NOT_TESTED', assertions: [],
    reason: item.gap ?? 'This run has not produced case evidence.',
  }));
}
