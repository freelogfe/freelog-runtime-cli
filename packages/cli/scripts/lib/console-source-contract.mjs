/**
 * Console 源码 / tools-lib 类型契约（非浏览器抓包）。
 * 真源：resourceCreatorPage/step2Effects.ts、collectionCreatorPage/step2Effects.ts
 */

export const CREATE_VERSION_CONSOLE_FIELDS = [
  'version',
  'fileSha1',
  'filename',
  'description',
  'dependencies',
  'baseUpcastResources',
  'authExcludedItems',
  'inputAttrs',
  'customPropertyDescriptors',
];

/** Console 单品 step2 submit：不传 batchSignContracts（batch 另路径） */
export const CREATE_VERSION_CONSOLE_OMITS = ['batchSignContracts'];

export const UPDATE_COLLECTION_CONSOLE_FIELDS = [
  'description',
  'catalogueProperty',
  'isMergeCatalogueDraft',
  'inputAttrs',
  'customPropertyDescriptors',
  'dependencies',
  'baseUpcastResources',
  'authExcludedItems',
];

/** dry-run 是执行计划，不是已上传后的 Console createVersion body。 */
export function validateCreateVersionPlanContract(body, unresolved = []) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['plan body 非对象'];
  if (!body.version || typeof body.version !== 'string') errors.push('plan 缺少 version');
  if (!body.filename || typeof body.filename !== 'string') errors.push('plan 缺少 filename');
  if (!body.fileSha1 || typeof body.fileSha1 !== 'string') errors.push('plan 缺少 fileSha1');
  const unresolvedSet = new Set(unresolved);
  for (const field of ['inputAttrs', 'customPropertyDescriptors']) {
    const value = body[field];
    if (value === 'unresolved') {
      if (!unresolvedSet.has(`createVersionParams.${field}`)) {
        errors.push(`${field} 标记 unresolved 但顶层 unresolved[] 未登记`);
      }
    } else if (value !== undefined && !Array.isArray(value)) {
      errors.push(`plan ${field} 应为数组或 unresolved`);
    }
  }
  if (body.fileSha1 === 'unresolved' && !unresolvedSet.has('createVersionParams.fileSha1')) {
    errors.push('fileSha1 标记 unresolved 但顶层 unresolved[] 未登记');
  }
  return errors;
}

export function validateCreateVersionContract(body, opts = {}) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['body 非对象'];
  }

  for (const key of CREATE_VERSION_CONSOLE_OMITS) {
    if (body[key] !== undefined && body[key] !== null) {
      errors.push(`Console 单品不应传 ${key}`);
    }
  }

  if (!body.version || typeof body.version !== 'string') {
    errors.push('缺少 version');
  }
  if (!body.fileSha1 || typeof body.fileSha1 !== 'string') {
    errors.push('缺少 fileSha1');
  }
  if (!body.filename || typeof body.filename !== 'string') {
    errors.push('缺少 filename');
  }

  for (const field of ['dependencies', 'baseUpcastResources', 'authExcludedItems']) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      errors.push(`${field} 应为数组`);
    }
  }

  if (body.inputAttrs !== undefined) {
    if (!Array.isArray(body.inputAttrs)) {
      errors.push('inputAttrs 应为数组');
    } else {
      for (const row of body.inputAttrs) {
        if (!row?.key || typeof row.key !== 'string') errors.push('inputAttrs 行缺少 key');
        if (row?.value === undefined) errors.push(`inputAttrs.${row?.key} 缺少 value`);
      }
    }
  }

  if (body.customPropertyDescriptors !== undefined && !Array.isArray(body.customPropertyDescriptors)) {
    errors.push('customPropertyDescriptors 应为数组');
  }

  if (opts.expectVideoCover === false && body.videoCover !== undefined) {
    errors.push('Console step2 当前 TODO：不应传 videoCover（与 Console 源码一致时可关）');
  }

  if (opts.minInputAttrs !== undefined && (body.inputAttrs?.length || 0) < opts.minInputAttrs) {
    errors.push(`inputAttrs 至少 ${opts.minInputAttrs} 项（类型 ${opts.typeCode || ''}）`);
  }

  return errors;
}

export function validateUpdateCollectionContract(body, opts = {}) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['body 非对象'];
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description 应为 string');
  }
  if (body.catalogueProperty === undefined || typeof body.catalogueProperty !== 'object') {
    errors.push('catalogueProperty 应为 object');
  }
  if (body.isMergeCatalogueDraft !== opts.expectedMerge) {
    errors.push(`isMergeCatalogueDraft 应为 ${opts.expectedMerge}，实际 ${body.isMergeCatalogueDraft}`);
  }

  for (const field of ['inputAttrs', 'dependencies', 'baseUpcastResources', 'authExcludedItems']) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      errors.push(`${field} 应为数组`);
    }
  }

  if (body.inputAttrs) {
    for (const row of body.inputAttrs) {
      if (!row?.key) errors.push('inputAttrs 行缺少 key');
    }
  }

  return errors;
}

/** Console collectionManager version_syncAllProperties：仅 authExcludedItems + customPropertyDescriptors */
export const SYNC_PROPERTIES_CONSOLE_FIELDS = ['authExcludedItems', 'customPropertyDescriptors'];

export const SYNC_PROPERTIES_CONSOLE_OMITS = [
  'description',
  'catalogueProperty',
  'isMergeCatalogueDraft',
  'inputAttrs',
  'dependencies',
  'baseUpcastResources',
];

export function validateSyncPropertiesContract(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['body 非对象'];
  }

  for (const key of SYNC_PROPERTIES_CONSOLE_OMITS) {
    if (body[key] !== undefined && body[key] !== null) {
      errors.push(`properties sync 不应传 ${key}`);
    }
  }

  for (const field of SYNC_PROPERTIES_CONSOLE_FIELDS) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      errors.push(`${field} 应为数组`);
    }
  }

  if (!('authExcludedItems' in body)) {
    errors.push('缺少 authExcludedItems（可为 []）');
  }
  if (!('customPropertyDescriptors' in body)) {
    errors.push('缺少 customPropertyDescriptors（可为 []）');
  }

  return errors;
}

export function formatContractErrors(errors, max = 6) {
  return errors.slice(0, max).join('; ');
}

/** createBatch.createResourceObjects[] 单项：与 createVersion 同构字段（无 resourceId） */
export function validateCreateBatchItemContract(body, opts = {}) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['item 非对象'];
  }
  if (!body.name || typeof body.name !== 'string') {
    errors.push('缺少 name');
  }
  if (!body.fileSha1 || typeof body.fileSha1 !== 'string') {
    errors.push('缺少 fileSha1');
  }
  if (!body.filename || typeof body.filename !== 'string') {
    errors.push('缺少 filename');
  }
  if (!body.version || typeof body.version !== 'string') {
    errors.push('缺少 version');
  }
  if (body.inputAttrs !== undefined && !Array.isArray(body.inputAttrs)) {
    errors.push('inputAttrs 应为数组');
  }
  if (body.customPropertyDescriptors !== undefined && !Array.isArray(body.customPropertyDescriptors)) {
    errors.push('customPropertyDescriptors 应为数组');
  }
  for (const field of ['dependencies', 'baseUpcastResources', 'authExcludedItems']) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      errors.push(`${field} 应为数组`);
    }
  }
  if (opts.minInputAttrs !== undefined && (body.inputAttrs?.length || 0) < opts.minInputAttrs) {
    errors.push(`inputAttrs 至少 ${opts.minInputAttrs} 项`);
  }
  return errors;
}
