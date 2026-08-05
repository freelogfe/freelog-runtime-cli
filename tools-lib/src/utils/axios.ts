import axios, { AxiosRequestConfig } from 'axios';
import { completeUrlByDomain } from './domain';
import { getPlatform } from '../platform/runtime';

const axiosInstance = axios.create();
(axiosInstance as any).CancelToken = axios.CancelToken;
(axiosInstance as any).isCancel = axios.isCancel;

/** 相对路径请求强制指向 API 域名（防止 MFSU / Charles 映射等场景下 baseURL 被覆盖） */
axiosInstance.interceptors.request.use(async (config) => {
  const platform = getPlatform();
  const url = config.url;
  if (typeof url === 'string' && url.length > 0 && !/^https?:\/\//i.test(url) && !url.startsWith('//')) {
    config.baseURL = completeUrlByDomain('api');
  }
  config.withCredentials = platform.withCredentials;
  const authorization = await platform.getAuthorization?.();
  if (authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = authorization;
  }
  const extraHeaders = await platform.getHeaders?.();
  if (extraHeaders) {
    config.headers = config.headers || {};
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value) config.headers[key] = value;
    }
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(JSON.stringify({ status: response.status }));
    }
    if (response.headers['content-disposition']?.includes('attachment;')) {
      return;
    }
    return response.data;
  },
  (error) => Promise.reject(error),
);

export default axiosInstance;

export async function request(
  config: AxiosRequestConfig,
  { noRedirect = false, noErrorAlert = false }: any = {},
): Promise<any> {
  const result: any = await axiosInstance.request(config);
  const platform = getPlatform();
  if (result.errCode === 30 && !noRedirect) {
    await platform.onAuthError?.({ kind: 'unauthorized', result });
  } else if (result.ret === 4 && result.errCode === 10 && !noRedirect) {
    await platform.onAuthError?.({ kind: 'frozen', result });
  }
  const errCode =
    result?.errCode !== undefined
      ? result.errCode
      : result?.errcode !== undefined
        ? result.errcode
        : result?.ret;
  if (errCode !== undefined && errCode !== 0) {
    await platform.onApiError?.({ errCode, result });
  }
  return result;
}
