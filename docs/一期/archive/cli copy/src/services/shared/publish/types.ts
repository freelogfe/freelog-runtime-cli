import type { CustomPropertyDescriptor } from '../../../config/project.js';

export type FilePropertyInheritData = {
  additionalProperties: Array<{ key: string; value: string }>;
  customProperties: Array<{
    key: string;
    name: string;
    value: string;
    description: string;
  }>;
  customConfigurations: Array<{
    key: string;
    name: string;
    description: string;
    type: 'input' | 'select';
    input: string;
    select: string[];
  }>;
};

export type SystemProperty = {
  key: string;
  name: string;
  value: string;
  description: string;
  type: 'raw' | 'additional';
  valueConfig?: AttrValueConfig;
};

export type HandleFilePropertiesResult = {
  sha1: string;
  resourceTypeCode: string;
  state: 'failed' | 'success';
  failedMsg: string;
  systemProperties: SystemProperty[];
  customProperties: FilePropertyInheritData['customProperties'];
  customConfigurations: FilePropertyInheritData['customConfigurations'];
};

export type AttrValueConfig = {
  text?: { nullable: boolean; minLength: number; maxLength: number };
  textArea?: { nullable: boolean; minLength: number; maxLength: number };
  integer?: { nullable: boolean; min: number; max: number };
  decimal?: {
    nullable: boolean;
    minDecimal: number;
    maxDecimal: number;
    precision: number;
  };
  date?: { nullable: boolean; startDate: string; limitDate: string };
  dataTime?: { nullable: boolean; startDateTime: string; limitDateTime: string };
  configText?: {
    nullable: boolean;
    defaultValue: string;
    minLength: number;
    maxLength: number;
  };
  configEnum?: { nullable: boolean; defaultValue: string; options: string[] };
};

export type MetaInfoItem = {
  insertMode: 1 | 2;
  key: string;
  name: string;
  remark: string;
  value: number | string | null;
  valueDisplay: string;
  valueUnit: string;
};

export type MetaInfoArray = MetaInfoItem[];

export type AttrInfoByKey = {
  key: string;
  format: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  contentRule?: {
    startDate?: string;
    limitDate?: string;
    startDateTime?: string;
    limitDateTime?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    minDecimal?: number;
    maxDecimal?: number;
    precision?: number;
    allowedElements?: string[];
  };
  valueConfig: AttrValueConfig;
};

export type ApiEnvelope<T> = {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: T;
};

export type FileListInfoRow = {
  sha1: string;
  fileSize: number;
  metaAnalyzeStatus: number;
  metaInfoArray: MetaInfoArray;
};

export type ParsedFileInfo = {
  sha1: string;
  metaAnalyzeStatus: 0 | 1 | 2 | 3;
  fileSize: number;
  metaInfoArray: MetaInfoArray;
};

export type CreateVersionProperties = {
  inputAttrs: Array<{ key: string; value: string }>;
  customPropertyDescriptors: CustomPropertyDescriptor[];
};
