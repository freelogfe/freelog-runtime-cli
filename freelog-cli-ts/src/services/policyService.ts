import { policyTemplates, PolicyTemplatesResponse, PolicyTemplateInfo, DisplayItem } from "../api/policy";
/**
 * 将包含 ${变量名} 的字符串解析为数组（使用 split）
 * @param str 输入的字符串
 * @returns 解析后的字符串数组
 */
function parseStringWithVariables(str: string): string[] {
    // 使用 split 分割，正则中的捕获组会保留分隔符
    const parts = str.split(/(\$\{[^}]+\})/);
  
    // 过滤掉空字符串
    return parts.filter((part) => part.length > 0);
  }
  
  export async function getPolicyTemplateInfos(): Promise<PolicyTemplateInfo[]> {
    const data: PolicyTemplatesResponse[] = await policyTemplates();
  
    return data.map((d, i: number) => {
      const coreText: string = d.report;
      const parts = parseStringWithVariables(coreText);
      console.log(parts);
      const displayData = parts.map((part) => {
        if (!part.startsWith("${")) {
          return {
            id: part,
            type: "text",
            text: {
              value: part,
            },
          };
        }
        const id: string = part.slice(2, -1);
        const type: "number" | "select" | "datetime" =
          d.reportUiTemplate.find((item) => item.id === id)?.uiSectionType ===
          "number"
            ? "number"
            : d.reportUiTemplate.find((item) => item.id === id)?.uiSectionType ===
              "select"
            ? "select"
            : "datetime";
        if (type === "number") {
          return {
            id: id,
            type: "number",
            number: {
              value: d.reportUiTemplate.find((item) => item.id === id)
                ?.uiSectionDefaultValue as number,
            },
          };
        }
        if (type === "select") {
          return {
            id: id,
            type: "select",
            select: {
              value: d.reportUiTemplate.find((item) => item.id === id)
                ?.uiSectionDefaultValue as string,
              options: d.reportUiTemplate.find((item) => item.id === id)
                ?.selectOptions as {
                label: string;
                value: string;
              }[],
            },
          };
        }
        if (type === "datetime") {
          return {
            id: id,
            type: "datetime",
            datetime: {
              value: d.reportUiTemplate.find((item) => item.id === id)
                ?.uiSectionDefaultValue as string,
            },
          };
        }
      }) as DisplayItem[];
      return {
        id: d._id,
        title: d.title,
        code: d.template,
        translation: d.reportTranslate,
        displayData: displayData,
        // displayTranslation: '',
      };
    });
  }
  