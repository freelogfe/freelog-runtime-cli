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

export function formatBatchProgressLine(event: BatchImportProgressEvent): string {
  return `${JSON.stringify(event)}\n`;
}
