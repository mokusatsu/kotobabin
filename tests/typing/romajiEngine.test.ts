import { describe, expect, it } from 'vitest';
import { WORDS_DATA } from '@/contracts/data';
import { RomajiEngine } from '@/typing/romajiEngine';

function typeString(reading: string, input: string) {
  const engine = new RomajiEngine(reading);
  const results = [];
  for (const ch of input) {
    results.push(engine.step(ch));
  }
  return { engine, results, last: results[results.length - 1] };
}

describe('RomajiEngine', () => {
  it('matches canonicalLength for ALL 960 words in WORDS_DATA', () => {
    expect(WORDS_DATA.words.length).toBe(960);
    for (const word of WORDS_DATA.words) {
      const engine = new RomajiEngine(word.reading);
      expect(
        engine.canonicalLength,
        `Mismatch for ${word.id} (${word.display} / ${word.reading})`,
      ).toBe(word.canonicalLength);
    }
  });

  it('handles basic variants: si/shi/ci, ti/chi, tu/tsu, fu/hu', () => {
    for (const input of ['si', 'shi', 'ci']) {
      const { engine, last } = typeString('し', input);
      expect(engine.canonicalLength).toBe(2);
      expect(last.accepted).toBe(true);
      expect(last.completed).toBe(true);
    }
    for (const input of ['ti', 'chi']) {
      const { engine, last } = typeString('ち', input);
      expect(engine.canonicalLength).toBe(2);
      expect(last.completed).toBe(true);
    }
    for (const input of ['tu', 'tsu']) {
      const { engine, last } = typeString('つ', input);
      expect(engine.canonicalLength).toBe(2);
      expect(last.completed).toBe(true);
    }
    for (const input of ['fu', 'hu']) {
      const { engine, last } = typeString('ふ', input);
      expect(engine.canonicalLength).toBe(2);
      expect(last.completed).toBe(true);
    }
  });

  it('handles yoon and separate kana input: kya/kixya/kilya, sha/sya/shixya/sixya', () => {
    for (const input of ['kya', 'kixya', 'kilya']) {
      const { engine, last } = typeString('きゃ', input);
      expect(engine.canonicalLength).toBe(3);
      expect(last.completed).toBe(true);
    }
    for (const input of ['sha', 'sya', 'shixya', 'sixya']) {
      const { engine, last } = typeString('しゃ', input);
      expect(engine.canonicalLength).toBe(3);
      expect(last.completed).toBe(true);
    }
  });

  it('handles foreign shortcuts and long mark: thi-/texi-/teli-', () => {
    for (const input of ['thi-', 'texi-', 'teli-']) {
      const { engine, last } = typeString('てぃー', input);
      expect(engine.canonicalLength).toBe(4);
      expect(last.completed).toBe(true);
    }
  });

  it('handles sokuon gemination, explicit input, and t-prefix before ch*', () => {
    for (const input of ['gakkou', 'gaxtukou', 'galtukou']) {
      const { engine, last } = typeString('がっこう', input);
      expect(engine.canonicalLength).toBe(6);
      expect(last.completed).toBe(true);
    }
    for (const input of ['maccha', 'matcha', 'mattya', 'maxtucha']) {
      const { engine, last } = typeString('まっちゃ', input);
      expect(engine.canonicalLength).toBe(6);
      expect(last.completed).toBe(true);
    }
  });

  it('handles nasal ん rules and preserves んな ambiguity', () => {
    for (const input of ['onna', 'onnna', "on'na", 'oxnna']) {
      const { engine, last } = typeString('おんな', input);
      expect(engine.canonicalLength).toBe(4);
      expect(last.completed).toBe(true);
    }

    for (const input of ['kanni', "kan'i", 'kaxni']) {
      const { last } = typeString('かんい', input);
      expect(last.completed).toBe(true);
    }
    const kani = typeString('かんい', 'kani');
    expect(kani.results[3].accepted).toBe(false);
    expect(kani.results[3].completed).toBe(false);
    expect(kani.engine.typedText).toBe('kan');
    expect(kani.engine.step('n').accepted).toBe(true);
    expect(kani.engine.step('i').completed).toBe(true);

    for (const input of ['shinnya', 'sinnya', "shin'ya", 'sixnya']) {
      const { last } = typeString('しんや', input);
      expect(last.completed).toBe(true);
    }
    const shinya = typeString('しんや', 'shinya');
    expect(shinya.results[4].accepted).toBe(false);
    expect(shinya.engine.typedText).toBe('shin');
    expect(shinya.engine.step('n').accepted).toBe(true);
    expect(shinya.engine.step('y').accepted).toBe(true);
    expect(shinya.engine.step('a').completed).toBe(true);

    for (const input of ['kann', "kan'", 'kaxn']) {
      const { last } = typeString('かん', input);
      expect(last.completed).toBe(true);
    }
    const kan = typeString('かん', 'kan');
    expect(kan.last.accepted).toBe(true);
    expect(kan.last.completed).toBe(false);
  });

  it('handles particles, uppercase normalization, and mistake state preservation', () => {
    for (const input of ['konnichiha', 'konnitiha', 'konnnichiha']) {
      const { last } = typeString('こんにちは', input);
      expect(last.completed).toBe(true);
    }

    const upper = typeString('ねこ', 'NEKO');
    expect(upper.engine.canonicalLength).toBe(4);
    expect(upper.last.completed).toBe(true);

    const engine = new RomajiEngine('ねこ');
    expect(engine.step('n').accepted).toBe(true);
    expect(engine.step('e').accepted).toBe(true);
    const err = engine.step('z');
    expect(err.accepted).toBe(false);
    expect(err.typed).toBe('ne');
    expect(err.guide).toBe('ko');
    expect(engine.step('k').accepted).toBe(true);
    expect(engine.step('o').completed).toBe(true);
  });

  it('updates only remaining guide suffix when branching to another valid spelling', () => {
    const engine = new RomajiEngine('しゃ');
    expect(engine.guide).toBe('sya');
    const r1 = engine.step('s');
    expect(r1.typed).toBe('s');
    expect(r1.guide).toBe('ya');
    const r2 = engine.step('h');
    expect(r2.accepted).toBe(true);
    expect(r2.typed).toBe('sh');
    expect(r2.guide).toBe('a');
    const r3 = engine.step('a');
    expect(r3.completed).toBe(true);
    expect(r3.guide).toBe('');
  });
});
