import semver from 'semver';

export function isValidVersion(version) {
  return Boolean(semver.valid(version));
}

export function parseVersion(version) {
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    preRelease: parsed.prerelease.length > 0 ? parsed.prerelease.join('.') : null,
    build: parsed.build.length > 0 ? parsed.build.join('.') : null
  };
}

export function formatVersion(parts) {
  const preRelease = parts.preRelease ? `-${parts.preRelease}` : '';
  const build = parts.build ? `+${parts.build}` : '';
  return `${parts.major}.${parts.minor}.${parts.patch}${preRelease}${build}`;
}

export function incrementVersion(version, type = 'patch') {
  const normalized = normalizeVersion(version);
  const incremented = semver.inc(normalized, type);
  if (!incremented) {
    throw new Error(`Failed to increment version "${version}" using type "${type}".`);
  }
  return incremented;
}

export function compareVersions(a, b) {
  return semver.compare(normalizeVersion(a), normalizeVersion(b));
}

export function normalizeVersion(version) {
  if (!version) {
    return '0.0.0';
  }
  const validVersion = semver.valid(version);
  if (validVersion) {
    return validVersion;
  }
  const coerced = semver.coerce(version);
  if (coerced) {
    return coerced.version;
  }
  throw new Error(`Unable to normalize version: ${version}`);
}

export function satisfies(version, range) {
  if (!range || range === 'latest') {
    return true;
  }
  try {
    return semver.satisfies(normalizeVersion(version), range);
  } catch {
    return false;
  }
}
