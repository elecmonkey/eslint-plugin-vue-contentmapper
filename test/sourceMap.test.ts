import { SpanMapKind } from '@vue/content-mapper';
import { expect, test } from 'rstack/test';
import { LineIndex, SourceMap } from '../src/sourceMap';

// generated: `xx onClick yy count zz`
// original:          click    count
const sourceMap = new SourceMap([
  [3, 7, 100, 5, SpanMapKind.Atom, 0],
  [13, 5, 200, 5, SpanMapKind.Verbatim, 0],
  [20, 0, 300, 0, SpanMapKind.Verbatim, 0],
]);

test('unmapped start is dropped', () => {
  expect(sourceMap.toOriginalRange(0, 5)).toBeUndefined();
  expect(sourceMap.toOriginalRange(10, 15)).toBeUndefined();
  // Zero-length mappings never carry a report.
  expect(sourceMap.toOriginalRange(20, 20)).toBeUndefined();
});

test('verbatim offsets map linearly', () => {
  expect(sourceMap.toOriginalRange(14, 16)).toEqual([201, 203]);
  expect(sourceMap.toOriginalRange(15, 15)).toEqual([202, 202]);
});

test('atom offsets map to the whole original span', () => {
  expect(sourceMap.toOriginalRange(5, 6)).toEqual([100, 105]);
});

test('unmapped end is clamped to the start mapping', () => {
  expect(sourceMap.toOriginalRange(14, 30)).toEqual([201, 205]);
});

test('end in a later mapping extends the range', () => {
  expect(sourceMap.toOriginalRange(3, 18)).toEqual([100, 205]);
});

test('fixes map only inside one verbatim mapping', () => {
  expect(sourceMap.toOriginalFixRange(13, 18)).toEqual([200, 205]);
  // Insertion at the end boundary of a verbatim mapping.
  expect(sourceMap.toOriginalFixRange(18, 18)).toEqual([205, 205]);
  expect(sourceMap.toOriginalFixRange(3, 10)).toBeUndefined();
  expect(sourceMap.toOriginalFixRange(12, 18)).toBeUndefined();
  expect(sourceMap.toOriginalFixRange(13, 19)).toBeUndefined();
});

test('line index round-trips offsets and handles CRLF', () => {
  const lines = new LineIndex('ab\r\ncd\nef');
  expect(lines.toOffset(2, 1)).toBe(4);
  expect(lines.toPosition(4)).toEqual({ line: 2, column: 1 });
  expect(lines.toPosition(8)).toEqual({ line: 3, column: 2 });
});
