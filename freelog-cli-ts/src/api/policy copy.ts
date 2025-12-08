/**
 * 策略和翻译模板相关 API
 * @see https://doc.freelog.com/translate/%E7%BF%BB%E8%AF%91%E6%A8%A1%E6%9D%BF%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */

import { freelogRequest } from "../core/http";

export interface ListTranslateConfigResponse {
  _id: string;
  title: string;
  template: string;
  reportTranslate: string;
  report: string;
  reportUiTemplate: {
    id: string;
    type: string;
    uiSectionDefaultValue: string | number;
    uiSectionType: "number" | "select";
    selectOptions: {
      label: string;
      value: string;
    }[];
  }[];
}

/**
 * 列出奖励模板（客户端）
 * @param params 查询参数
 * @see https://doc.freelog.com/translate/%E7%BF%BB%E8%AF%91%E6%A8%A1%E6%9D%BF%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */
export async function policyTemplates(): Promise<
  ListTranslateConfigResponse[]
> {
  return freelogRequest.get<ListTranslateConfigResponse[]>(
    "/v2/translate/translate-config/list4Client"
  );
}

export interface PolicyTemplateInfo {
  id: string;
  title: string;
  code: string;
  translation: string;
  displayData: DisplayItem[];
}

export interface DisplayItem {
  id: string; // 唯一标识，用于寻找在策略模板和翻译模版中替换填充的位置
  type:
    | "text" // 文本
    | "number" // 数字
    | "datetime" // 日期时间
    | "select"; // 选择;
  text?: {
    value: string; // 展示的文字
  };
  number?: {
    value: number; // 填充的数字
    min?: number; // 最小值
    max?: number; // 最大值
    precision?: number; // 小数位数
  };
  datetime?: {
    value: string; // 填充的日期时间，格式:YY-MM-DD HH:mm
    minDatetime?: string; // 最小日期（包含），同样会限制面板的切换范围，格式：YYYY-MM-DD HH:mm
    maxDatetime?: string; // 最大日期（包含），同样会限制面板的切换范围，格式：YYYY-MM-DD HH:mm
  };
  select?: {
    value: string; // 填充的选项
    options: {
      label: string; // 展示的文字
      value: string; // 填充的值
    }[];
  };
}

