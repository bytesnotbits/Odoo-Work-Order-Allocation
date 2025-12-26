import { naturalCompare } from '../lib/natural';

test('naturalCompare sorts numeric-looking strings numerically', () => {
  const items = ['1000', '20', '3', '11', '2'];
  const sorted = items.slice().sort(naturalCompare);
  expect(sorted).toEqual(['2', '3', '11', '20', '1000']);
});
