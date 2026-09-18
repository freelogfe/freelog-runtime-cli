import { describe, expect, it } from 'vitest';
import { fileAlreadyExists } from '../src/services/storageUpload.js';

describe('fileAlreadyExists', () => {
  it('accepts Console-style array payloads', () => {
    expect(fileAlreadyExists([{ sha1: 'x', isExisting: true }])).toBe(true);
    expect(fileAlreadyExists([{ sha1: 'x', isExisting: false }])).toBe(false);
  });

  it('accepts object and boolean payloads', () => {
    expect(fileAlreadyExists({ isExisting: true })).toBe(true);
    expect(fileAlreadyExists(true)).toBe(true);
    expect(fileAlreadyExists(false)).toBe(false);
    expect(fileAlreadyExists(null)).toBe(false);
  });
});
