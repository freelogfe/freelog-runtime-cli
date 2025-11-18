/**
 * 统一的错误处理工具
 * 用于在命令中统一处理和展示错误信息
 */

import chalk from 'chalk';
import { AxiosError } from 'axios';
import { getErrCodeMessage, isAuthenticationError, isParameterError, isAuthorizationError } from './errorCode';

/**
 * 格式化并展示错误信息
 * @param error 错误对象
 * @param defaultMessage 默认错误消息
 * @param showStack 是否显示堆栈信息（debug 模式）
 */
export function handleError(error: any, defaultMessage: string = '操作失败', showStack: boolean = false): void {
  let errorMessage = defaultMessage;
  
  // 调试：在 debug 模式下打印错误对象的完整结构
  if (showStack) {
    console.log(chalk.gray('\n[调试] 错误对象结构:'));
    console.log(chalk.gray(`  error.message: ${error?.message}`));
    console.log(chalk.gray(`  error.response: ${error?.response ? '存在' : '不存在'}`));
    console.log(chalk.gray(`  error.data: ${error?.data ? '存在' : '不存在'}`));
    if (error?.response?.data) {
      console.log(chalk.gray(`  error.response.data: ${JSON.stringify(error.response.data).substring(0, 200)}`));
    }
    if (error?.data) {
      console.log(chalk.gray(`  error.data: ${JSON.stringify(error.data).substring(0, 200)}`));
    }
  }
  
  // 提取错误信息的优先级：
  // 1. error.data.msg（拦截器保存的响应数据中的错误信息）
  // 2. error.response.data.msg（HTTP 响应中的错误信息）
  // 3. error.message（拦截器提取的错误信息）
  // 4. error.response.data.message（HTTP 响应中的 message 字段）
  // 5. 其他可能的错误信息字段
  
  // 获取错误码（优先使用 errCode，如果没有则使用 ret）
  const getErrCode = (): number | undefined => {
    if (error?.errCode !== undefined) {
      return error.errCode;
    } else if (error?.data?.errCode !== undefined) {
      return error.data.errCode;
    } else if (error?.response?.data?.errCode !== undefined) {
      return error.response.data.errCode;
    } else if (error?.data?.ret !== undefined) {
      return error.data.ret;
    } else if (error?.response?.data?.ret !== undefined) {
      return error.response.data.ret;
    }
    return undefined;
  };
  
  const errCode = getErrCode();
  
  // 1. 优先从 error.data 中提取 API 返回的错误信息（拦截器可能将响应数据保存在 error.data 中）
  if (error?.data) {
    const errorData = error.data as any;
    // Freelog API 标准错误格式：{ errCode: 非0, msg: "错误信息" } 或 { ret: 非0, msg: "错误信息" }
    if (errorData?.msg) {
      errorMessage = errorData.msg;
    } else if (errorData?.message) {
      errorMessage = errorData.message;
    } else if (errCode !== undefined && errCode !== 0) {
      // 如果有错误码，即使没有 msg 也要显示错误
      const errCodeMsg = getErrCodeMessage(errCode);
      errorMessage = errorData.msg || `API 请求失败 (${errCodeMsg})`;
    }
  }
  
  // 2. 从 error.response.data 中提取 API 返回的错误信息
  if (!errorMessage || errorMessage === defaultMessage) {
    if (error?.response?.data) {
      const errorData = error.response.data as any;
      // 优先使用 API 返回的错误信息
      if (errorData?.msg) {
        errorMessage = errorData.msg;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (errCode !== undefined && errCode !== 0) {
        const errCodeMsg = getErrCodeMessage(errCode);
        errorMessage = errorData.msg || `API 请求失败 (${errCodeMsg})`;
      }
    }
  }
  
  // 3. 如果错误对象有 message 属性，使用它（http.ts 拦截器已经提取了 API 错误信息）
  if (!errorMessage || errorMessage === defaultMessage) {
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
  }
  
  // 显示错误信息
  console.log(chalk.red('✖ ') + errorMessage);
  
  // 提取错误数据的统一函数
  const getErrorData = (): any => {
    // 优先从 error.data 获取（拦截器保存的响应数据）
    if (error?.data && typeof error.data === 'object') {
      return error.data;
    }
    // 其次从 error.response.data 获取
    if (error?.response?.data && typeof error.response.data === 'object') {
      return error.response.data;
    }
    return null;
  };
  
  const errorData = getErrorData();
  
  // 如果 errorData 存在，优先从 errorData 获取错误码（覆盖之前的值）
  let finalErrCode = errCode;
  if (errorData) {
    if (errorData.errCode !== undefined) {
      finalErrCode = errorData.errCode;
    } else if (errorData.ret !== undefined && finalErrCode === undefined) {
      finalErrCode = errorData.ret;
    }
  }
  
  // 如果找到了错误数据，显示详细信息
  if (errorData) {
    // 显示状态码
    if (error?.status) {
      console.log(chalk.red(`   状态码: ${error.status}`));
    } else if (error?.response?.status) {
      console.log(chalk.red(`   状态码: ${error.response.status}`));
    }
    
    // 显示错误码（errCode 优先，如果没有则使用 ret）
    if (finalErrCode !== undefined && finalErrCode !== 0) {
      const errCodeMsg = getErrCodeMessage(finalErrCode);
      console.log(chalk.red(`   错误码: ${finalErrCode} (${errCodeMsg})`));
    }
    
    // 如果错误信息与主错误信息不同，显示详细信息
    if (errorData?.msg && errorData.msg !== errorMessage) {
      console.log(chalk.red('   详细信息: ') + errorData.msg);
    }
    
    // 显示其他有用的错误字段（在 debug 模式下）
    if (showStack) {
      const otherFields = Object.keys(errorData).filter(key => 
        key !== 'msg' && key !== 'message' && key !== 'ret' && key !== 'errCode' && 
        errorData[key] !== null && errorData[key] !== undefined
      );
      if (otherFields.length > 0) {
        console.log(chalk.gray('   错误详情:'));
        otherFields.forEach(key => {
          const value = errorData[key];
          const valueStr = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value);
          console.log(chalk.gray(`     ${key}: ${valueStr}`));
        });
      }
    }
  } else if (error?.response) {
    // 如果没有找到错误数据，但存在 response，至少显示状态码
    const axiosError = error as AxiosError;
    if (axiosError.response?.status && axiosError.response.status !== 200) {
      console.log(chalk.red(`   状态码: ${axiosError.response.status}`));
    }
  }
  
  // 根据错误码提供帮助提示
  if (finalErrCode !== undefined && finalErrCode !== 0) {
    if (isAuthenticationError(finalErrCode)) {
      console.log(chalk.yellow('\n💡 提示: 请先登录'));
      console.log(chalk.yellow('  freelog-cli login'));
    } else if (isParameterError(finalErrCode)) {
      console.log(chalk.yellow('\n💡 提示: 请检查请求参数是否正确'));
    } else if (isAuthorizationError(finalErrCode)) {
      console.log(chalk.yellow('\n💡 提示: 您没有执行此操作的权限'));
    }
  }
  
  // debug 模式下显示堆栈信息
  if (showStack && error?.stack) {
    console.error(chalk.gray('\n堆栈信息:'));
    console.error(error.stack);
  }
  
  // 根据错误信息提供帮助提示（如果还没有根据错误码提供提示）
  if (finalErrCode === undefined || finalErrCode === 0) {
    if (errorMessage.includes('未登录') || errorMessage.includes('请先登录')) {
      console.log(chalk.yellow('\n💡 提示: 请先登录'));
      console.log(chalk.yellow('  freelog-cli login'));
    }
    
    if (errorMessage.includes('找不到配置文件') || errorMessage.includes('配置文件')) {
      console.log(chalk.yellow('\n💡 提示:'));
      console.log(chalk.yellow('  1. 确保在项目根目录执行命令'));
      console.log(chalk.yellow('  2. 或使用 -c 参数指定配置文件路径'));
    }
  }
}

/**
 * 处理错误并退出程序
 * @param error 错误对象
 * @param defaultMessage 默认错误消息
 * @param showStack 是否显示堆栈信息（debug 模式）
 */
export function handleErrorAndExit(error: any, defaultMessage: string = '操作失败', showStack: boolean = false): never {
  handleError(error, defaultMessage, showStack);
  process.exit(1);
}

