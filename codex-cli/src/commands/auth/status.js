import fs from "fs-extra";
import { formatDateTime } from "../../utils/datetime.js";
import {
  GLOBAL_CREDENTIALS_FILE,
  WORKSPACE_CREDENTIALS_FILE
} from "../../constants/paths.js";

export function buildStatusCommand(renderer) {
  return {
    matches: (command, subcommand) => command === "login" && subcommand === "status",
    handler: async () => {
      const status = await readStatuses();
      renderer.table(
        [
          formatRow("全局", status.global),
          formatRow("工作空间", status.workspace)
        ],
        { header: ["范围", "用户名", "登录时间", "过期时间", "状态"] }
      );
      const hints = [];
      if (!status.global) {
        hints.push("尚未进行全局登录，可执行 freelog-cli login -g");
      }
      if (!status.workspace) {
        hints.push("尚未进行工作空间登录，可在项目内执行 freelog-cli login");
      }
      if (hints.length > 0) {
        renderer.newline();
        hints.forEach((hint) => renderer.muted(hint));
      }
    }
  };
}

async function readStatuses() {
  return {
    global: await readCredential(GLOBAL_CREDENTIALS_FILE),
    workspace: await readCredential(WORKSPACE_CREDENTIALS_FILE)
  };
}

async function readCredential(file) {
  try {
    if (!(await fs.pathExists(file))) {
      return null;
    }
    const data = await fs.readJson(file);
    const remainingMs = new Date(data.expiresAt).getTime() - Date.now();
    return {
      ...data,
      isExpired: remainingMs <= 0,
      remainingDays: Math.max(0, Math.round(remainingMs / (1000 * 60 * 60 * 24)))
    };
  } catch {
    return null;
  }
}

function formatRow(label, record) {
  if (!record) {
    return [label, "-", "-", "-", "-"];
  }
  return [
    label,
    record.username ?? "-",
    formatDateTime(record.loginTime),
    formatDateTime(record.expiresAt),
    record.isExpired ? "已过期" : `有效（剩余 ${record.remainingDays} 天）`
  ];
}
