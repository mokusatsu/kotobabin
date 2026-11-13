import { expect, test } from 'vitest';
import { packPages } from '../../src/ui/ipad-layout';

test('measured pagination keeps every control group in order and never drops an oversized group', () => {
  const groups = [{id:'filters',height:80},{id:'first-word',height:120},{id:'second-word',height:120},{id:'purchase-and-price',height:280},{id:'return',height:44}];
  for (const capacity of [44,150,200,300,680]) {
    const pages = packPages(groups, candidate => candidate.reduce((sum, group) => sum + group.height, 0) <= capacity);
    expect(pages.flat()).toEqual(groups);
    expect(pages.every(page => page.length === 1 || page.reduce((sum, group) => sum + group.height, 0) <= capacity)).toBe(true);
    expect(new Set(pages.flat().map(group => group.id)).size).toBe(groups.length);
  }
  expect(packPages([], () => true)).toEqual([[]]);
});
