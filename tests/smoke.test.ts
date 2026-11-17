import { describe, expect, it } from 'vitest';
import { WORDS_DATA } from '@/contracts/data';

describe('M0 smoke test', () => {
  it('loads 960 words from spec/initial/data/words.json', () => {
    expect(WORDS_DATA.words).toHaveLength(960);
    expect(WORDS_DATA.dictionarySetId).toBe('kotobabin-ja-960-v2');
  });
});
