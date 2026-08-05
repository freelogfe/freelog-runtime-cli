import type { PlatformAdapter } from './types';

let currentPlatform: PlatformAdapter | null = null;

export function setPlatform(adapter: PlatformAdapter): void {
  currentPlatform = adapter;
}

export function configurePlatform(adapter: Partial<PlatformAdapter>): void {
  if (!currentPlatform) {
    throw new Error(
      '[@freelog/tools-lib] Platform not configured. Import from "@freelog/tools-lib/browser" or "@freelog/tools-lib/node" first.'
    );
  }
  currentPlatform = {
    ...currentPlatform,
    ...adapter,
  };
}

export function getPlatform(): PlatformAdapter {
  if (!currentPlatform) {
    throw new Error(
      '[@freelog/tools-lib] Platform not configured. Import from "@freelog/tools-lib/browser" or "@freelog/tools-lib/node".'
    );
  }
  return currentPlatform;
}
