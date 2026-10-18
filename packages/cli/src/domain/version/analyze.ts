/** Console 同源 SSE 文件分析。表单、上传与提交共用，不缓存派生字段定义。 */
import { CliError } from '../../core/errors';
import { StringDecoder } from 'node:string_decoder';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

export type AnalyzeApis = {
  filesListInfoSse?: (params: {
    sha1: string;
    resourceTypeCode: string;
  }) => Promise<AsyncIterable<Uint8Array | string>>;
};

/** 资源类型在分析请求中传递；2/3 都消费元数据，不擅自将 3 判为发行失败。 */
export async function waitAnalyze(
  sha1: string,
  typeCode: string,
  apis: AnalyzeApis,
): Promise<Record<string, unknown>> {
  const filesListInfoSse = apis.filesListInfoSse ?? ((params) => {
    assertPlatformAllowed();
    return FServiceAPI.Storage.filesListInfoSse(params);
  });
  return waitAnalyzeSse(await filesListInfoSse({ sha1, resourceTypeCode: typeCode }), sha1);
}

/** 同一 SHA 的终态；成功及失败都关闭原流，不让清理掩盖业务结果。 */
export async function waitAnalyzeSse(
  stream: AsyncIterable<Uint8Array | string>,
  sha1: string,
  timeoutMs = 120_000,
): Promise<Record<string, unknown>> {
  let buffer = '';
  let dataLines: string[] = [];
  // Axios Node SSE 返回原始 Buffer；中文字段名可能跨网络分块，不能逐块独立解码。
  const decoder = new StringDecoder('utf8');
  const deadline = Date.now() + timeoutMs;
  const evaluate = (): Record<string, unknown> | undefined => {
    if (dataLines.length === 0) return undefined;
    const payload = dataLines.join('\n');
    dataLines = [];
    if (payload === '[DONE]') return undefined;
    let info: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
      info = parsed as Record<string, unknown>;
    } catch {
      throw new CliError('属性解析流返回了无效数据', 'FILE_ANALYZE_STREAM_INVALID');
    }
    if (typeof info.sha1 === 'string' && info.sha1 !== sha1) return undefined;
    const status = Number(info.metaAnalyzeStatus ?? info.status);
    if (status === 2 || status === 3) return info;
    return undefined;
  };
  const consumeLine = (line: string): Record<string, unknown> | undefined => {
    if (line === '') return evaluate();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).replace(/^ /u, ''));
    return undefined;
  };

  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new CliError('属性解析超时', 'FILE_ANALYZE_TIMEOUT');
      const next = await nextStreamChunk(iterator, remaining);
      if (next.done) break;
      const chunk = next.value;
      buffer += typeof chunk === 'string' ? decoder.end() + chunk : decoder.write(Buffer.from(chunk));
      while (true) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline).replace(/\r$/u, '');
        buffer = buffer.slice(newline + 1);
        const result = consumeLine(line);
        if (result) return result;
      }
    }
    buffer += decoder.end();
    const finalLine = buffer.replace(/\r$/u, '');
    const result = consumeLine(finalLine) ?? evaluate();
    if (result) return result;
    throw new CliError('属性解析连接已结束，未收到完成结果', 'FILE_ANALYZE_STREAM_INCOMPLETE');
  } finally {
    const nodeStream = stream as AsyncIterable<Uint8Array | string> & { destroy?: () => void };
    nodeStream.destroy?.();
  }
}

async function nextStreamChunk<T>(iterator: AsyncIterator<T>, timeoutMs: number): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new CliError('属性解析超时', 'FILE_ANALYZE_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
