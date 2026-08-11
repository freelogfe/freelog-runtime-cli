export interface PlatformResourceInfo {
  resourceId: string;
  resourceName?: string;
  resourceType?: string[];
  resourceTypeCode?: string;
  resourceTitle?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  userId?: number | string;
  username?: string;
  latestVersion?: string;
  status?: number;
  policies?: Array<{ policyId?: string; policyName?: string; status?: number }>;
  updateDate?: string;
  feedUrl?: string;
  rssGuid?: string;
  rssPubDate?: string;
  serializeStatus?: 0 | 1;
}

export interface PlatformVersionDraft {
  exists: boolean;
  updateDate?: string;
  version?: string;
  fingerprint?: string;
  raw?: unknown;
}
