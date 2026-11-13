import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performanceProfile } from './performance-fixture';

test('generate validated synthetic benchmark profile using actual domain reducers', () => {
  const profile = performanceProfile();
  expect(Object.keys(profile.progress.words)).toHaveLength(960);
  expect(profile.progress.recentRounds).toHaveLength(30);
  mkdirSync('work/m6-performance', { recursive: true });
  writeFileSync('work/m6-performance/profile.json', JSON.stringify(profile));
}, 120000);
