import { FServiceAPI, unwrapData } from '../platform/index.js';

export async function rssPreview(opts: {
  feedUrl: string;
  isLoadItemData?: 0 | 1;
  pubStartDate?: string;
  pubEndDate?: string;
}) {
  return unwrapData<unknown>(await FServiceAPI.Rss.bindingsPreview(opts));
}

export async function rssCompare(opts: { resourceId: string; feedUrl: string }) {
  return unwrapData<unknown>(await FServiceAPI.Rss.bindingsCompare(opts));
}

export async function rssSendVerificationCode(opts: {
  feedUrl: string;
  resourceId: string;
}) {
  return unwrapData<unknown>(await FServiceAPI.Rss.sendVerificationCode(opts));
}

export async function rssBindFeed(opts: {
  resourceId: string;
  feedUrl: string;
  verificationCode: string;
  pubStartDate?: string;
  pubEndDate?: string;
}) {
  return unwrapData<unknown>(await FServiceAPI.Rss.bindFeed(opts));
}

export async function rssSyncBinding(opts: { resourceId: string }) {
  return unwrapData<unknown>(await FServiceAPI.Rss.syncBinding(opts));
}

export async function rssGetSyncProgress(opts: { resourceId: string }) {
  return unwrapData<unknown>(await FServiceAPI.Rss.getSyncProgress(opts));
}
