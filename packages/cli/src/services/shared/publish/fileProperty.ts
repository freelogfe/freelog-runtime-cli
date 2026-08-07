import { FServiceAPI, FUtil } from '../../../platform/index.js';
import { CliError } from '../../../core/errors.js';
import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import type { CustomPropertyDescriptor } from '../../../config/project.js';
import type {
  ApiEnvelope,
  AttrInfoByKey,
  AttrValueConfig,
  CreateVersionProperties,
  FileListInfoRow,
  FilePropertyInheritData,
  HandleFilePropertiesResult,
  MetaInfoArray,
  ParsedFileInfo,
  SystemProperty,
} from './types.js';

const POLL_DELAY_MS = 500;

function readEnvelope<T>(response: unknown): ApiEnvelope<T> {
  if (response && typeof response === 'object') {
    return response as ApiEnvelope<T>;
  }
  return { ret: 0, errCode: 0, data: response as T };
}

function assertApiOk<T>(envelope: ApiEnvelope<T>, label: string): T {
  const ret = envelope.ret ?? 0;
  const errCode = envelope.errCode ?? envelope.errcode ?? 0;
  if (ret !== 0 || errCode !== 0) {
    throw cliError(I18N_KEYS.api_label_failed, {
      code: 4,
      params: { label, msg: envelope.msg || '未知错误' },
      details: envelope,
    });
  }
  if (envelope.data === undefined) {
    throw cliError(I18N_KEYS.api_label_empty_data, { code: 4, details: envelope });
  }
  return envelope.data;
}

/** manifest → Console inheritData（≅ step2 draft 持久化字段） */
export function inheritDataFromVersionConfig(cfg: {
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
}): FilePropertyInheritData {
  const additionalProperties = (cfg.inputAttrs || [])
    .filter((attr) => attr?.key && attr.key !== 'runtimeVersion')
    .map((attr) => ({ key: attr.key, value: String(attr.value ?? '') }));

  const customProperties: FilePropertyInheritData['customProperties'] = [];
  const customConfigurations: FilePropertyInheritData['customConfigurations'] = [];

  for (const desc of cfg.customPropertyDescriptors || []) {
    if (!desc?.key) continue;
    const name = desc.name || desc.key;
    const description = desc.remark || '';
    if (desc.type === 'readonlyText') {
      customProperties.push({
        key: desc.key,
        name,
        value: String(desc.defaultValue ?? ''),
        description,
      });
      continue;
    }
    if (desc.type === 'editableText') {
      customConfigurations.push({
        key: desc.key,
        name,
        description,
        type: 'input',
        input: String(desc.defaultValue ?? ''),
        select: [],
      });
      continue;
    }
    if (desc.type === 'select') {
      customConfigurations.push({
        key: desc.key,
        name,
        description,
        type: 'select',
        input: '',
        select: (desc.candidateItems || []).map(String),
      });
    }
  }

  return { additionalProperties, customProperties, customConfigurations };
}

/** handleData 结果 → createVersion 字段（≅ step2 submitBtn） */
export function createVersionPropertiesFromHandleData(
  result: HandleFilePropertiesResult,
): CreateVersionProperties {
  const inputAttrs = result.systemProperties
    .filter((item) => item.type === 'additional')
    .map((item) => ({ key: item.key, value: item.value }));

  const customPropertyDescriptors: CustomPropertyDescriptor[] = [
    ...result.customProperties.map((item) => ({
      type: 'readonlyText',
      key: item.key,
      name: item.name,
      remark: item.description,
      defaultValue: item.value,
    })),
    ...result.customConfigurations.map((item) => {
      const isInput = item.type === 'input';
      return {
        type: isInput ? 'editableText' : 'select',
        key: item.key,
        name: item.name,
        remark: item.description,
        defaultValue: isInput ? item.input : item.select[0] || '',
        candidateItems: isInput ? undefined : item.select,
      };
    }),
  ];

  return { inputAttrs, customPropertyDescriptors };
}

/** Node 侧轮询解析（≅ Console getFilesSha1Info / creatorBatch Task，不用浏览器 SSE） */
export async function pollFilesSha1Info(opts: {
  sha1: string[];
  resourceTypeCode: string;
  delayMs?: number;
}): Promise<{ error: string; result: ParsedFileInfo[] }> {
  if (!opts.sha1.length) {
    return { error: '', result: [] };
  }

  let pending = [...opts.sha1];
  const finished: ParsedFileInfo[] = [];
  const delayMs = opts.delayMs ?? POLL_DELAY_MS;

  while (pending.length > 0) {
    const envelope = readEnvelope<FileListInfoRow[]>(
      await FServiceAPI.Storage.filesListInfo({
        sha1: pending.join(','),
        resourceTypeCode: opts.resourceTypeCode,
      }),
    );
    const ret = envelope.ret ?? 0;
    const errCode = envelope.errCode ?? envelope.errcode ?? 0;
    if (ret !== 0 || errCode !== 0) {
      return { error: envelope.msg || 'filesListInfo 失败', result: finished };
    }

    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    pending = rows
      .filter((row) => row.metaAnalyzeStatus === 0 || row.metaAnalyzeStatus === 1)
      .map((row) => row.sha1);

    for (const row of rows) {
      if (row.metaAnalyzeStatus === 0 || row.metaAnalyzeStatus === 1) continue;
      finished.push({
        sha1: row.sha1,
        metaAnalyzeStatus: row.metaAnalyzeStatus as ParsedFileInfo['metaAnalyzeStatus'],
        fileSize: row.fileSize,
        metaInfoArray: row.metaInfoArray || [],
      });
    }

    if (pending.length === 0) break;
    await FUtil.Tool.promiseSleep(delayMs);
  }

  return { error: '', result: finished };
}

async function getAttrsInfoByKeys(keys: string[]): Promise<AttrInfoByKey[]> {
  if (!keys.length) return [];

  const responses = await Promise.all(
    keys.map((key) => FServiceAPI.Resource.getAttrsInfoByKey({ key })),
  );

  return responses.map((response, index) => {
    const data = assertApiOk(
      readEnvelope<AttrInfoByKey>(response),
      `getAttrsInfoByKey(${keys[index] || index})`,
    );
    return buildAttrInfoWithValueConfig(data);
  });
}

function buildAttrInfoWithValueConfig(raw: Omit<AttrInfoByKey, 'valueConfig'>): AttrInfoByKey {
  const valueConfig: AttrValueConfig = {};
  const rule = raw.contentRule;

  if (raw.format === 4) {
    valueConfig.date = {
      nullable: true,
      startDate: rule?.startDate || '1000-01-01',
      limitDate: rule?.limitDate || '9999-12-31',
    };
  } else if (raw.format === 5) {
    valueConfig.dataTime = {
      nullable: true,
      startDateTime: rule?.startDateTime || '1000-01-01 00:00:00',
      limitDateTime: rule?.limitDateTime || '9999-12-31 23:59:59',
    };
  } else if (raw.format === 6) {
    valueConfig.text = {
      nullable: true,
      minLength: rule?.minLength || 0,
      maxLength: rule?.maxLength || 140,
    };
  } else if (raw.format === 7) {
    valueConfig.textArea = {
      nullable: true,
      minLength: rule?.minLength || 0,
      maxLength: rule?.maxLength || 140,
    };
  } else if (raw.format === 8) {
    valueConfig.integer = {
      nullable: true,
      min: rule?.min ?? Number.MIN_SAFE_INTEGER,
      max: rule?.max ?? Number.MAX_SAFE_INTEGER,
    };
  } else if (raw.format === 9) {
    valueConfig.decimal = {
      nullable: true,
      minDecimal: rule?.minDecimal ?? Number.MIN_SAFE_INTEGER,
      maxDecimal: rule?.maxDecimal ?? Number.MAX_SAFE_INTEGER,
      precision: rule?.precision ?? Number.MAX_SAFE_INTEGER,
    };
  } else if (raw.format === 10) {
    valueConfig.configEnum = {
      nullable: true,
      defaultValue: '',
      options: rule?.allowedElements || [],
    };
  }

  return { ...raw, valueConfig };
}

async function loadMetaInfoArray(opts: {
  sha1: string;
  resourceTypeCode: string;
}): Promise<MetaInfoArray | null> {
  if (opts.sha1) {
    const { error, result } = await pollFilesSha1Info({
      sha1: [opts.sha1],
      resourceTypeCode: opts.resourceTypeCode,
    });
    if (error) {
      throw cliError(I18N_KEYS.file_property_parse_failed, { code: 4, details: { sha1: opts.sha1 } });
    }
    const parsed = result.find((item) => item.sha1 === opts.sha1);
    if (!parsed || (parsed.metaAnalyzeStatus !== 2 && parsed.metaAnalyzeStatus !== 3)) {
      return null;
    }
    return parsed.metaInfoArray;
  }

  const data = assertApiOk(
    readEnvelope<{ metaInfoArray: MetaInfoArray }>(
      await FServiceAPI.Storage.filesInfo({ resourceTypeCode: opts.resourceTypeCode }),
    ),
    'Storage.filesInfo',
  );
  return data.metaInfoArray || [];
}

/** 移植 Console handleData_By_Sha1_And_ResourceTypeCode_And_InheritData2（无 UI） */
export async function handleFilePropertiesBySha1(opts: {
  sha1: string;
  resourceTypeCode: string;
  inheritData: FilePropertyInheritData;
}): Promise<HandleFilePropertiesResult> {
  const { sha1, resourceTypeCode, inheritData } = opts;
  const metaInfoArray = await loadMetaInfoArray({ sha1, resourceTypeCode });

  if (metaInfoArray === null) {
    return {
      sha1,
      resourceTypeCode,
      state: 'failed',
      failedMsg: '文件元信息解析未完成或失败',
      systemProperties: [],
      customProperties: [],
      customConfigurations: [],
    };
  }

  const additionalKeys = metaInfoArray
    .filter((item) => item.insertMode === 2)
    .map((item) => item.key);
  const attrInfos = await getAttrsInfoByKeys(additionalKeys);

  const systemProperties: SystemProperty[] = metaInfoArray
    .map((item) => {
      if (item.insertMode === 1) {
        return {
          key: item.key,
          name: item.name,
          value: item.valueDisplay,
          description: item.remark,
          type: 'raw' as const,
          valueConfig: {},
        };
      }

      const attrInfo = attrInfos.find((info) => info.key === item.key);
      return {
        key: item.key,
        name: item.name,
        value:
          inheritData.additionalProperties.find((ap) => ap.key === item.key)?.value ||
          inheritData.customProperties.find((cp) => cp.key === item.key)?.value ||
          '',
        description: item.remark,
        type: 'additional' as const,
        valueConfig: attrInfo?.valueConfig,
      };
    })
    .filter((item) => !(item.type === 'raw' && item.value === ''));

  const systemKeys = systemProperties.map((item) => item.key);
  const systemNames = systemProperties.map((item) => item.name);

  const customProperties = inheritData.customProperties.filter(
    (cp) => !systemKeys.includes(cp.key) && !systemNames.includes(cp.name),
  );
  const customPropertyKeys = customProperties.map((item) => item.key);
  const customPropertyNames = customProperties.map((item) => item.name);

  const customConfigurations = inheritData.customConfigurations.filter(
    (cc) =>
      !systemKeys.includes(cc.key) &&
      !systemNames.includes(cc.name) &&
      !customPropertyKeys.includes(cc.key) &&
      !customPropertyNames.includes(cc.name),
  );

  return {
    sha1,
    resourceTypeCode,
    state: 'success',
    failedMsg: '',
    systemProperties,
    customProperties,
    customConfigurations,
  };
}

/** publish / import-dir 共用：上传后解析并产出 createVersion 属性字段 */
export async function resolveCreateVersionPropertiesFromFile(opts: {
  sha1: string;
  resourceTypeCode: string;
  inheritData: FilePropertyInheritData;
}): Promise<CreateVersionProperties> {
  const handleResult = await handleFilePropertiesBySha1(opts);
  if (handleResult.state !== 'success') {
    if (handleResult.failedMsg) {
      throw new CliError(handleResult.failedMsg, {
        code: 4,
        details: { sha1: opts.sha1, resourceTypeCode: opts.resourceTypeCode },
        hint: '确认文件已上传且资源类型支持本地文件；补充属性可写入 manifest inputAttrs / customPropertyDescriptors',
      });
    }
    throw cliError(I18N_KEYS.file_property_parse_failed, {
      code: 4,
      details: { sha1: opts.sha1, resourceTypeCode: opts.resourceTypeCode },
      hint: '确认文件已上传且资源类型支持本地文件；补充属性可写入 manifest inputAttrs / customPropertyDescriptors',
    });
  }
  return createVersionPropertiesFromHandleData(handleResult);
}

/** 合集壳 / 无文件场景：Storage.filesInfo 类型属性模板（≅ collection Step1 handleData sha1:''） */
export async function resolveCollectionPropertiesFromType(opts: {
  resourceTypeCode: string;
  inheritData: FilePropertyInheritData;
}): Promise<CreateVersionProperties> {
  const handleResult = await handleFilePropertiesBySha1({
    sha1: '',
    resourceTypeCode: opts.resourceTypeCode,
    inheritData: opts.inheritData,
  });
  if (handleResult.state !== 'success') {
    if (handleResult.failedMsg) {
      throw new CliError(handleResult.failedMsg, {
        code: 4,
        details: { resourceTypeCode: opts.resourceTypeCode },
      });
    }
    throw cliError(I18N_KEYS.collection_type_template_load_failed, {
      code: 4,
      details: { resourceTypeCode: opts.resourceTypeCode },
    });
  }
  return createVersionPropertiesFromHandleData(handleResult);
}
