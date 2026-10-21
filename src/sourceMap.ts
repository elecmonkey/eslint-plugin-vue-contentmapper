import { SpanMapKind, type SpanMapping } from '@vue/content-mapper';

const lineBreakPattern = new RegExp('\\r\\n|[\\r\\n\\u2028\\u2029]', 'gu');

export interface Position {
  line: number;
  column: number;
}

/**
 * Converts between offsets and ESLint's 1-based line / column positions.
 */
export class LineIndex {
  #lineStarts = [0];
  #length: number;

  constructor(text: string) {
    this.#length = text.length;
    for (const match of text.matchAll(lineBreakPattern)) {
      this.#lineStarts.push(match.index + match[0].length);
    }
  }

  toOffset(line: number, column: number): number {
    const lineStart = this.#lineStarts[line - 1];
    if (lineStart === undefined) {
      return this.#length;
    }
    return Math.min(lineStart + column - 1, this.#length);
  }

  toPosition(offset: number): Position {
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.#lineStarts[middle]! <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { line: low + 1, column: offset - this.#lineStarts[low]! + 1 };
  }
}

export interface Mapping {
  generatedStart: number;
  generatedEnd: number;
  originalStart: number;
  originalEnd: number;
  verbatim: boolean;
}

export type Range = [start: number, end: number];

/**
 * Maps virtual-code offsets back to the original file through content-mapper span mappings.
 * Zero-length mappings are navigation anchors and never carry a lint report, so they are skipped.
 */
export class SourceMap {
  #mappings: Mapping[];

  constructor(mappings: readonly SpanMapping[]) {
    this.#mappings = mappings
      .filter(([, generatedLength]) => generatedLength > 0)
      .map(
        ([
          generatedStart,
          generatedLength,
          originalStart,
          originalLength,
          kind,
        ]) => ({
          generatedStart,
          generatedEnd: generatedStart + generatedLength,
          originalStart,
          originalEnd: originalStart + originalLength,
          verbatim: kind === SpanMapKind.Verbatim,
        }),
      )
      .sort((left, right) => left.generatedStart - right.generatedStart);
  }

  /**
   * Maps a virtual range to an original range. The start must be mapped; an unmapped end is
   * clamped to the end of the start's mapping. Returns `undefined` when the start is unmapped.
   */
  toOriginalRange(start: number, end: number): Range | undefined {
    const startMapping = this.#findContaining(start);
    if (!startMapping) {
      return undefined;
    }
    const originalStart = toOriginalOffset(startMapping, start, 'start');
    if (end <= start) {
      return [originalStart, originalStart];
    }
    const endMapping =
      end <= startMapping.generatedEnd
        ? startMapping
        : this.#findContaining(end - 1);
    let originalEnd = endMapping
      ? toOriginalOffset(endMapping, end, 'end')
      : startMapping.originalEnd;
    if (originalEnd < originalStart) {
      originalEnd = startMapping.originalEnd;
    }
    return [originalStart, originalEnd];
  }

  /**
   * Maps a fix range only when it lies inside a single verbatim mapping, where virtual and
   * original text are identical and the replacement means the same thing in both.
   */
  toOriginalFixRange(start: number, end: number): Range | undefined {
    const mapping =
      this.#findContaining(start) ?? this.#findContaining(start - 1);
    if (
      !mapping ||
      !mapping.verbatim ||
      start < mapping.generatedStart ||
      end > mapping.generatedEnd
    ) {
      return undefined;
    }
    const delta = mapping.originalStart - mapping.generatedStart;
    return [start + delta, end + delta];
  }

  /** The mapping whose generated span contains `offset`, if any. */
  mappingAt(offset: number): Mapping | undefined {
    return this.#findContaining(offset);
  }

  #findContaining(offset: number) {
    let low = 0;
    let high = this.#mappings.length - 1;
    let found: Mapping | undefined;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const mapping = this.#mappings[middle]!;
      if (mapping.generatedStart <= offset) {
        found = mapping;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found && offset < found.generatedEnd ? found : undefined;
  }
}

function toOriginalOffset(
  mapping: Mapping,
  offset: number,
  side: 'start' | 'end',
) {
  if (mapping.verbatim) {
    return mapping.originalStart + offset - mapping.generatedStart;
  }
  // Atom mappings correspond as a whole, e.g. `onClick` <= `click`.
  return side === 'start' ? mapping.originalStart : mapping.originalEnd;
}
