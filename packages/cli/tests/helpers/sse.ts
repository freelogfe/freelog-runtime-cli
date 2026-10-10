/** 为版本解析测试构造与 Console 相同的 SSE data 事件。 */
export function sseResult(payload: Record<string, unknown>) {
  return async (): Promise<AsyncIterable<string>> => {
    async function* stream(): AsyncGenerator<string> {
      yield `data: ${JSON.stringify(payload)}\n\n`;
    }
    return stream();
  };
}

export function sseEvents(...payloads: Array<Record<string, unknown>>) {
  return async (): Promise<AsyncIterable<string>> => {
    async function* stream(): AsyncGenerator<string> {
      for (const payload of payloads) {
        yield `data: ${JSON.stringify(payload)}\n\n`;
      }
    }
    return stream();
  };
}
