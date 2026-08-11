export type BatchImportProgressEvent =
  | { event: 'start'; total: number }
  | {
      event: 'skip';
      index: number;
      file: string;
      resourceId: string;
      subdir: string;
      reason: 'sha1-reuse';
    }
  | {
      event: 'ok';
      index: number;
      file: string;
      resourceId: string;
      resourceName: string;
      subdir: string;
    }
  | { event: 'fail'; index: number; file: string; error: string }
  | { event: 'done'; ok: number; fail: number; total: number };

export function emitBatchProgress(
  sink: ((event: BatchImportProgressEvent) => void) | undefined,
  event: BatchImportProgressEvent,
): void {
  sink?.(event);
}

export interface BatchProgressFormatter {
  (event: BatchImportProgressEvent): string;
}

/** NDJSON 进度行（DESIGN schemaVersion + seq + event + data） */
export function createBatchProgressFormatter(command: string): BatchProgressFormatter {
  let seq = 0;
  return (event: BatchImportProgressEvent) => {
    seq += 1;
    const { event: eventName, ...data } = event;
    return `${JSON.stringify({
      schemaVersion: 1,
      command,
      seq,
      event: eventName,
      data,
    })}\n`;
  };
}

export function formatBatchProgressLine(
  event: BatchImportProgressEvent,
  opts?: { command?: string; seq?: number },
): string {
  const { event: eventName, ...data } = event;
  return `${JSON.stringify({
    schemaVersion: 1,
    command: opts?.command ?? 'resource import-dir',
    seq: opts?.seq ?? 1,
    event: eventName,
    data,
  })}\n`;
}
