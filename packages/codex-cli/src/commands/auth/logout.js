import fs from "fs-extra";
import path from "node:path";
import axios from "axios";
import { withSpinner } from "../../cli/spinner.js";
import {
  GLOBAL_CREDENTIALS_FILE,
  WORKSPACE_CREDENTIALS_FILE
} from "../../constants/paths.js";

const AUTH_SCOPE = {
  GLOBAL: "global",
  WORKSPACE: "workspace"
};

export function buildLogoutCommand(renderer) {
  return {
    matches: (command, subcommand) => command === "logout" && !subcommand,
    handler: async ({ options }) => {
      const scope = resolveScope(options);
      const result = await withSpinner("正在清除登录状态...", () => performLogout(scope));
      const messages = [];
      if (result.global) {
        messages.push("已清除全局登录状态。");
      }
      if (result.workspace) {
        messages.push("已清除工作空间登录状态。");
      }
      if (messages.length === 0) {
        renderer.warn("未找到需要清除的登录信息。");
        return;
      }
      messages.forEach((msg) => renderer.success(msg));
    }
  };
}

function resolveScope(options) {
  if (options.g || options.global) {
    return AUTH_SCOPE.GLOBAL;
  }
  if (options.workspace) {
    return AUTH_SCOPE.WORKSPACE;
  }
  return null;
}

async function performLogout(scope) {
  if (!scope) {
    const [globalResult, workspaceResult] = await Promise.all([
      logoutSingleScope(AUTH_SCOPE.GLOBAL),
      logoutSingleScope(AUTH_SCOPE.WORKSPACE)
    ]);
    return { global: globalResult, workspace: workspaceResult };
  }
  if (scope === AUTH_SCOPE.GLOBAL) {
    return { global: await logoutSingleScope(scope), workspace: false };
  }
  return { global: false, workspace: await logoutSingleScope(scope) };
}

async function logoutSingleScope(scope) {
  const file = scope === AUTH_SCOPE.GLOBAL ? GLOBAL_CREDENTIALS_FILE : WORKSPACE_CREDENTIALS_FILE;
  if (!(await fs.pathExists(file))) {
    return false;
  }
  let credential;
  try {
    credential = await fs.readJson(file);
  } catch {
    credential = null;
  }
  const host = globalThis.FREELOG_HOST ?? "https://api.freelog.com";
  if (credential?.authorization) {
    try {
      await axios.post(
        `${host}/v2/passport/logout`,
        {},
        { headers: { authorization: credential.authorization } }
      );
    } catch {
      // 忽略远端错误，继续清理本地凭证
    }
  }
  await fs.remove(file);
  const dir = path.dirname(file);
  try {
    const remains = await fs.readdir(dir);
    if (remains.length === 0) {
      await fs.remove(dir);
    }
  } catch {
    // ignore
  }
  return true;
}
