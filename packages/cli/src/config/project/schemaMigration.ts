import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const;

export type ProjectDocument = Record<string, unknown>;
type ProjectMigration = (document: ProjectDocument) => ProjectDocument;

const manifestMigrations = new Map<number, ProjectMigration>();
const stateMigrations = new Map<number, ProjectMigration>();

function assertDocument(value: unknown, label: string): asserts value is ProjectDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cliError(I18N_KEYS.label_format_invalid, { code: 4, params: { label } });
  }
}

function migrateProjectDocument(
  raw: unknown,
  label: string,
  migrations: ReadonlyMap<number, ProjectMigration>,
): ProjectDocument {
  assertDocument(raw, label);
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw cliError(I18N_KEYS.project_schema_invalid, { code: 4, params: { label } });
  }
  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw cliError(I18N_KEYS.project_schema_unsupported, {
      code: 4,
      params: { label, version, current: CURRENT_PROJECT_SCHEMA_VERSION },
      hint: '请升级 freelog-cli 后重试，不要用旧版本覆盖该项目文件',
    });
  }

  let document = raw;
  let currentVersion = version;
  while (currentVersion < CURRENT_PROJECT_SCHEMA_VERSION) {
    const migrate = migrations.get(currentVersion);
    if (!migrate) {
      throw cliError(I18N_KEYS.project_schema_unsupported, {
        code: 4,
        params: { label, version: currentVersion, current: CURRENT_PROJECT_SCHEMA_VERSION },
        hint: '当前 CLI 未提供该版本到下一版本的迁移函数',
      });
    }
    document = migrate(document);
    currentVersion += 1;
    if (document.schemaVersion !== currentVersion) {
      throw cliError(I18N_KEYS.project_schema_invalid, { code: 4, params: { label } });
    }
  }
  return document;
}

/** Schema migration boundary; add version N -> N+1 functions to manifestMigrations. */
export function migrateManifestDocument(raw: unknown): ProjectDocument {
  return migrateProjectDocument(raw, 'freelog.manifest.json', manifestMigrations);
}

/** Schema migration boundary; add version N -> N+1 functions to stateMigrations. */
export function migrateStateDocument(raw: unknown): ProjectDocument {
  return migrateProjectDocument(raw, '.freelog/state.json', stateMigrations);
}
