import { describe, expect, it } from 'vitest';
import { isImageFilename } from '../src/services/coverGenerateService.js';

describe('coverGenerateService', () => {
  it('detects common image filenames', () => {
    expect(isImageFilename('photo.jpg')).toBe(true);
    expect(isImageFilename('photo.JPEG')).toBe(true);
    expect(isImageFilename('clip.mp4')).toBe(false);
  });
});
