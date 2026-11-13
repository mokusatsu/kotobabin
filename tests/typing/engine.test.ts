import { describe, expect, it } from 'vitest';
import wordsData from '../../spec/initial/data/words.json';
import { RomajiEngine } from '../../src/typing';

const cases: [string, string[], number][] = [
  ['し', ['si', 'shi', 'ci'], 2], ['ち', ['ti', 'chi'], 2], ['つ', ['tu', 'tsu'], 2], ['ふ', ['fu', 'hu'], 2],
  ['きゃ', ['kya', 'kixya', 'kilya'], 3], ['しゃ', ['sha', 'sya', 'shixya', 'sixya', 'cilya'], 3],
  ['てぃー', ['thi-', 'texi-', 'teli-'], 4], ['がっこう', ['gakkou', 'gaxtukou', 'galtukou'], 6],
  ['まっちゃ', ['maccha', 'matcha', 'mattya', 'maxtucha'], 6],
  ['おんな', ['onna', 'onnna', "on'na", 'oxnna'], 4], ['かんい', ['kanni', "kan'i", 'kaxni'], 5],
  ['しんや', ['shinnya', 'sinnya', "shin'ya", 'sixnya'], 6], ['かん', ['kann', "kan'", 'kaxn'], 4],
  ['こんにちは', ['konnichiha', 'konnitiha', 'konnnichiha'], 9],
  ['ゔぁ', ['va', 'vuxa', 'vula'], 2], ['じゃ', ['zilya'], 2], ['うぉ', ['who', 'whulo'], 3],
  ['んう', ['nwu'], 3], ['んい', ['nnyi'], 3], ['っちぇ', ['tche', 'cche'], 4],
  ['っあ', ['xtua'], 4], ['ん', ["n'"], 2], ['ねこ', ['NEKO'], 4],
  ['あっ', ['axtu'], 4], ['っっか', ['xtukka'], 4], ['っい', ['yyi'], 3], ['っー', ['--'], 2],
];

describe('RomajiEngine: canonical Python conformance cases', () => {
  for (const [reading, spellings, length] of cases) {
    it(`${reading} preserves every alternate and its canonical length`, () => {
      for (const spelling of spellings) {
        const engine = new RomajiEngine(reading);
        expect(engine.canonicalLength).toBe(length);
        for (const key of spelling) expect(engine.input(key).accepted, `${reading}/${spelling}/${key}`).toBe(true);
        expect(engine.complete, `${reading}/${spelling}`).toBe(true);
        expect(engine.remainingGuide).toBe('');
      }
    });
  }
  for (const [reading, spelling] of [ ['かんい', 'kani'], ['しんや', 'shinya'], ['かん', 'kan'], ['うぉ', 'wo'],
    ['てぃ', 'ti'], ['ぢ', 'ji'], ['んう', 'nu'], ['んい', 'nyi'], ['っちぇ', 'tye'], ['っあ', 'aa'],
    ['ん', 'n'], ['てぃー', 'thiー'], ['ねこ', 'ne ko'], ['ねこ', 'neKo'] ]) {
    it(`does not accept invalid complete path ${reading}/${spelling}`, () => {
      const engine = new RomajiEngine(reading);
      let allAccepted = true;
      for (const key of spelling) allAccepted = engine.input(key).accepted && allAccepted;
      expect(allAccepted && engine.complete).toBe(false);
    });
  }
  it('retains ambiguous nna/n nna states rather than selecting prematurely', () => {
    for (const suffix of ['a', 'na']) {
      const engine = new RomajiEngine('んな');
      expect(engine.input('n').accepted).toBe(true);
      expect(engine.input('n').accepted).toBe(true);
      for (const key of suffix) expect(engine.input(key).accepted).toBe(true);
      expect(engine.complete).toBe(true);
    }
  });
  it('keeps accepted characters and candidate guide after mistakes', () => {
    const engine = new RomajiEngine('しゃしん');
    engine.input('s'); engine.input('h');
    expect(engine.acceptedInput).toBe('sh');
    expect(engine.remainingGuide[0]).toBe('a');
    expect(engine.input('z')).toEqual({ accepted: false, completed: false });
    expect(engine.acceptedInput).toBe('sh');
    for (const key of engine.remainingGuide) expect(engine.input(key).accepted).toBe(true);
    expect(engine.complete).toBe(true);
  });
  it('recomputes the canonical length and a working guide for all 960 source words', () => {
    expect(wordsData.words).toHaveLength(960);
    for (const word of wordsData.words) {
      const engine = new RomajiEngine(word.reading);
      expect(engine.canonicalLength, word.id).toBe(word.canonicalLength);
      for (const key of engine.remainingGuide) expect(engine.input(key).accepted, word.id).toBe(true);
      expect(engine.complete, word.id).toBe(true);
    }
  });
});
