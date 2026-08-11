import { describe, expect, it } from 'vitest';
import {
  normalizeCollectRulesBody,
  parseBinaryFlag,
  parseConditionType,
} from '../src/services/collection/collectRulesContract.js';
import {
  assertRssDateRange,
  assertRssEpisodeRange,
  assertRssManagedContentEditable,
  assertRssPreviewCanContinue,
  isGuidMassMismatch,
  isRssRelatedResource,
  summarizeRssPreview,
  RSS_EPISODE_LIMIT,
} from '../src/services/collection/rssContract.js';

describe('Console-aligned collect-rules contract', () => {
  it('normalizes every Console field and prefixes STARTS_WITH auth identity', () => {
    expect(
      normalizeCollectRulesBody(
        {
          status: 1,
          serializeStatus: 0,
          conditionType: 1,
          filterConditions: [
            { key: 'resourceTitle', limitOperatorType: 'INCLUDES', value: '播客' },
            { key: 'authIdentity', limitOperatorType: 'STARTS_WITH', value: 'episode' },
            { key: 'resourceTypeCode', limitOperatorType: 'EQUAL', value: 'RT001' },
          ],
        },
        'tester',
      ),
    ).toEqual({
      status: 1,
      serializeStatus: 0,
      conditionType: 1,
      filterConditions: [
        { key: 'resourceTitle', limitOperatorType: 'INCLUDES', value: '播客' },
        { key: 'authIdentity', limitOperatorType: 'STARTS_WITH', value: 'tester/episode' },
        { key: 'resourceTypeCode', limitOperatorType: 'EQUAL', value: 'RT001' },
      ],
    });
  });

  it.each([
    [{ status: 2, conditionType: 1, filterConditions: [{}] }, 'status'],
    [{ status: 1, conditionType: 3, filterConditions: [{}] }, 'conditionType'],
    [{ status: 1, conditionType: 1, filterConditions: [] }, 'filterConditions'],
    [
      {
        status: 1,
        conditionType: 1,
        filterConditions: [
          { key: 'resourceTypeCode', limitOperatorType: 'INCLUDES', value: 'RT001' },
        ],
      },
      'EQUAL',
    ],
    [
      {
        status: 1,
        conditionType: 1,
        filterConditions: [
          { key: 'resourceTitle', limitOperatorType: 'EQUAL', value: 'title' },
        ],
      },
      '不支持',
    ],
  ])('rejects invalid Console-inexpressible rules', (input, message) => {
    expect(() => normalizeCollectRulesBody(input)).toThrow(String(message));
  });

  it('rejects invalid shorthand enum values before service execution', () => {
    expect(() => parseBinaryFlag('3', 'status')).toThrow('0 或 1');
    expect(() => parseConditionType('0')).toThrow('every');
  });
});

describe('Console-aligned RSS contract', () => {
  const preview = {
    feedData: { channel: { title: 'Podcast', ownerEmail: 'owner@example.com' } },
    matchedItemCount: RSS_EPISODE_LIMIT,
  };

  it('accepts a valid feed preview and applies the 15-episode boundary', () => {
    expect(() => assertRssPreviewCanContinue(preview)).not.toThrow();
    expect(() => assertRssEpisodeRange(preview)).not.toThrow();
    expect(() =>
      assertRssEpisodeRange({ ...preview, matchedItemCount: RSS_EPISODE_LIMIT + 1 }),
    ).toThrow('发布时间范围');
  });

  it('masks the owner email in CLI preview output', () => {
    expect(summarizeRssPreview(preview).maskedEmail).toBe('own***@example.com');
    expect(JSON.stringify(summarizeRssPreview(preview))).not.toContain('owner@example.com');
  });

  it('rejects invalid, owner-email-free, and other-user feeds', () => {
    expect(() => assertRssPreviewCanContinue({})).toThrow('RSS 地址无效');
    expect(() =>
      assertRssPreviewCanContinue({ feedData: { channel: { title: 'Podcast' } } }),
    ).toThrow('电子邮箱');
    expect(() =>
      assertRssPreviewCanContinue({
        ...preview,
        errorCode: 'submitpodcastwrss_error_alreadyexists02',
      }),
    ).toThrow('其他资源');
  });

  it('matches the Console GUID mismatch formula and date validation', () => {
    expect(
      isGuidMassMismatch({ oldFeedItemCount: 10, newFeedItemCount: 10, guidMatchedCount: 2 }),
    ).toBe(true);
    expect(
      isGuidMassMismatch({ oldFeedItemCount: 10, newFeedItemCount: 12, guidMatchedCount: 10 }),
    ).toBe(false);
    expect(() => assertRssDateRange('2026-08-10', undefined)).toThrow('同时提供');
    expect(() => assertRssDateRange('2026-08-12', '2026-08-10')).toThrow('不能晚于');
  });

  it('uses the same rssGuid/rssPubDate/feedUrl detection and locks managed content', () => {
    expect(isRssRelatedResource({ rssGuid: 'guid' })).toBe(true);
    expect(isRssRelatedResource({ rssPubDate: '2026-08-11' })).toBe(true);
    expect(isRssRelatedResource({ feedUrl: '' })).toBe(false);
    expect(() => assertRssManagedContentEditable({ feedUrl: 'https://feed' }, '修改目录')).toThrow(
      'feed 管理',
    );
  });
});
