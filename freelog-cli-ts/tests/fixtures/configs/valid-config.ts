import type { FreelogConfig } from '../../../public/freelog';

const config: FreelogConfig = {
  resourceId: "5ef081b8fb172026e434e2fa",
  version: "1.0.0",
  fileSha1: "4a10ed3b6e45f8014b8240ad37f44cfc9c75e754",
  filename: "resource.zip",
  description: "测试资源配置",
  dependencies: [
    {
      resourceId: "5ef081b8fb172026e434e2fc",
      versionRange: "^1.0.0"
    }
  ],
  customPropertyDescriptors: [
    {
      key: "theme",
      defaultValue: "light",
      type: "select",
      candidateItems: ["light", "dark"],
      remark: "主题设置"
    }
  ],
};

export default config;

