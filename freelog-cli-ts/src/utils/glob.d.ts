declare module 'glob' {
  export function sync(pattern: string, options?: any): string[];
  export function (pattern: string, options?: any, cb?: (err: Error | null, matches: string[]) => void): void;
}

