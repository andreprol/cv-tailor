// Numeric provenance: deciding whether a number the model wrote is the same
// real number that exists in the master data, after the model was free to
// translate and reformat the sentence around it.
//
// Its own module because two earlier attempts at this, written inline among
// the prompt building and CV assembly, each shipped a hole that only a
// focused table of equivalent/non-equivalent pairs caught:
//   1. "2,5 milhões" and "25 milhões" both read as 25000000 (the regex
//      captured only the digits AFTER the decimal comma).
//   2. "R$ 1.250,00" and "$125,000" both read as 125000 (any literal with
//      two or more separators was assumed to be thousands grouping).
// Both let a tenfold/hundredfold inflation reach a recruiter as authentic.
//
// The rule is VALUE equality, never digit-token matching.

const WORD_SCALES: { pattern: string; factor: number }[] = [
  // Longest-first: "milhões" must be tried before "mil", or a chained scale
  // like "2 mil milhões" reads as 2000.
  { pattern: 'milh[õo]es|milh[ãa]o|millions?', factor: 1_000_000 },
  { pattern: 'bilh[õo]es|bilh[ãa]o|billions?', factor: 1_000_000_000 },
  { pattern: 'mil|milhares|milhar|thousands?', factor: 1_000 },
]

// k / MM / bn are real scale suffixes in finance but also ordinary units and
// words elsewhere ("200 mm" is millimetres, "4K" is a resolution). Accepted
// only when the number is explicitly money — a currency symbol immediately
// before it — so a measurement can never be silently inflated a millionfold.
const SYMBOL_SCALES: { pattern: string; factor: number }[] = [
  { pattern: 'mm', factor: 1_000_000 },
  { pattern: 'bn', factor: 1_000_000_000 },
  { pattern: 'k', factor: 1_000 },
]

const CURRENCY_PREFIX = /(?:R\$|US\$|USD|BRL|EUR|GBP|[$€£])\s*$/i
// Only the tail of the preceding text matters; slicing the whole prefix for
// every number made this quadratic in the length of a cover letter.
const CURRENCY_LOOKBEHIND_WINDOW = 8

// `\b` is ASCII-only in JavaScript, so an accented letter right after a scale
// word counts as a word boundary: "2 Milão" would match "mil" inside a word
// and become 2000, inventing a number on BOTH sides of the comparison.
const NOT_WORD_CHAR = '(?![\\p{L}\\p{N}_])'

export interface ParsedNumber {
  /** NaN when the literal is not a plain number (a version string, an IP). */
  value: number
  /**
   * Whether the number carries a metric marker: a percent sign, a currency
   * symbol, or a scale word. Free prose is full of bare numbers that are not
   * claims about achievements ("since 2014", "10 years", "24/7", "level C1"),
   * and demanding provenance for those aborts honest writing.
   */
  marked: boolean
}

// Returns null when the literal cannot be read as one plain number under
// either interpretation — "1.2.3", "0.0.0.1". Concatenating those digits (the
// previous behavior) invented values like 123 and put them in the trusted set.
function parseNumericLiteral(literal: string): number | null {
  const trimmed = literal.replace(/[.,]+$/, '')
  if (!/^\d[\d.,]*$/.test(trimmed)) return null

  const separators = trimmed.match(/[.,]/g) ?? []
  if (separators.length === 0) return Number(trimmed)

  const allSameCharacter = separators.every((separator) => separator === separators[0])
  const lastIndex = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf(','))
  const tail = trimmed.slice(lastIndex + 1)

  // Mixed separators mean the last one is the decimal point and the rest are
  // grouping: "R$ 1.250,00" (pt-BR) and "$1,250.00" (en-US) are both 1250.
  // Reading them as pure grouping turned 1250 into 125000.
  if (!allSameCharacter) {
    const groupingPart = trimmed.slice(0, lastIndex)
    if (!isValidGrouping(groupingPart)) return null
    return Number(`${groupingPart.replace(/[.,]/g, '')}.${tail}`)
  }

  // A single separator followed by exactly three digits is grouping
  // ("1,000" / "1.500"); anything else is a decimal point.
  if (separators.length === 1 && tail.length !== 3) {
    return Number(`${trimmed.slice(0, lastIndex)}.${tail}`)
  }

  if (!isValidGrouping(trimmed)) return null
  return Number(trimmed.replace(/[.,]/g, ''))
}

// "1.234.567" is grouping; "1.2.3" is not. Groups after the first separator
// must be exactly three digits, and the first one to three.
function isValidGrouping(text: string): boolean {
  const groups = text.split(/[.,]/)
  if (groups.length === 1) return /^\d{1,}$/.test(groups[0])
  if (!/^\d{1,3}$/.test(groups[0])) return false
  return groups.slice(1).every((group) => /^\d{3}$/.test(group))
}

interface NumberToken extends ParsedNumber {
  factor: number | null
  start: number
  end: number
}

// Chained scales multiply: "2 mil milhões" is 2e9, not 2000.
function scaleFactorAt(text: string, position: number, precededByCurrency: boolean): { factor: number; end: number } | null {
  const candidates = precededByCurrency ? [...WORD_SCALES, ...SYMBOL_SCALES] : WORD_SCALES
  let factor: number | null = null
  let cursor = position

  for (;;) {
    const rest = text.slice(cursor)
    let advanced = false
    for (const candidate of candidates) {
      const match = new RegExp(`^\\s*(?:${candidate.pattern})${NOT_WORD_CHAR}`, 'iu').exec(rest)
      if (!match) continue
      factor = (factor ?? 1) * candidate.factor
      cursor += match[0].length
      advanced = true
      break
    }
    if (!advanced) break
  }

  return factor === null ? null : { factor, end: cursor }
}

// A scale word at the end of a range or enumeration applies to every item:
// "de 200 a 250 mil" is 200000 and 250000, and an honest translation writes
// "from 200,000 to 250,000".
//
// Deliberately narrow, because propagating too eagerly injects a value that
// does not exist anywhere ("Em 2019 e 5 milhões" must not yield 2019000000,
// which the model could then quote back and have accepted):
//   - `a` / `to` / `até` / dashes are range connectors and apply with two items;
//   - `e` / `and` / `,` are enumeration connectors and apply only in a chain
//     of three or more, which is what an actual list looks like;
//   - the earlier number must be smaller, since ranges ascend.
const RANGE_CONNECTOR = /^\s*(?:a|at[ée]|to|-|–|—)\s*(?:R\$|US\$|USD|BRL|EUR|GBP|[$€£])?\s*$/iu
const LIST_CONNECTOR = /^\s*(?:e|and|,|;)\s*(?:R\$|US\$|USD|BRL|EUR|GBP|[$€£])?\s*$/iu

function propagateScaleBackwards(tokens: NumberToken[], text: string): void {
  for (let index = tokens.length - 1; index > 0; index -= 1) {
    const scaled = tokens[index]
    if (scaled.factor === null) continue

    // Collect the chain first, then decide whether it qualifies — the rule
    // depends on how long the chain turned out to be.
    const chain: number[] = []
    let firstLinkIsList = false
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const current = tokens[previous]
      const next = tokens[previous + 1]
      if (current.factor !== null || Number.isNaN(current.value) || Number.isNaN(next.value)) break

      const between = text.slice(current.end, next.start)
      const isRange = RANGE_CONNECTOR.test(between)
      const isList = LIST_CONNECTOR.test(between)
      if (!isRange && !isList) break
      // Ranges and enumerations ascend. "Em 2019 e 5 milhões" fails here:
      // 2019 is not smaller than the 5 next to it, so it is a year sitting
      // beside an unrelated figure, not the low end of anything.
      if (!(current.value < next.value)) break

      if (chain.length === 0) firstLinkIsList = isList
      chain.push(previous)
    }

    // "a"/"to"/"–" is unambiguous with two items. "e"/","/"and" is ordinary
    // conjunction, so it only counts as an enumeration from three items up —
    // otherwise "versão 2 e 3 mil usuários" would turn the version into 2000.
    if (chain.length === 0 || (firstLinkIsList && chain.length < 2)) continue

    for (const position of chain) {
      tokens[position].factor = scaled.factor
      tokens[position].marked = true
    }
  }
}

export function parseNumbers(text: string): ParsedNumber[] {
  const tokens: NumberToken[] = []

  for (const match of text.matchAll(/\d[\d.,]*/g)) {
    const literal = match[0]
    const start = match.index
    const consumedEnd = start + literal.replace(/[.,]+$/, '').length
    const precededByCurrency = CURRENCY_PREFIX.test(text.slice(Math.max(0, start - CURRENCY_LOOKBEHIND_WINDOW), start))
    const scale = scaleFactorAt(text, consumedEnd, precededByCurrency)
    const parsed = parseNumericLiteral(literal)
    const isPercent = /^\s*(?:%|por\s?cento|percent)/i.test(text.slice(consumedEnd))

    tokens.push({
      value: parsed === null || !Number.isFinite(parsed) ? Number.NaN : parsed,
      marked: precededByCurrency || isPercent || scale !== null,
      factor: scale?.factor ?? null,
      start,
      end: scale?.end ?? consumedEnd,
    })
  }

  propagateScaleBackwards(tokens, text)

  return tokens.map((token) => ({
    value: Number.isNaN(token.value) ? Number.NaN : token.value * (token.factor ?? 1),
    marked: token.marked,
  }))
}

export function extractNumbers(text: string): number[] {
  return parseNumbers(text).filter((number) => !Number.isNaN(number.value)).map((number) => number.value)
}

// Absolute, not relative: these are money and counts, not scientific
// measurements. A relative epsilon accepted 1000000001 as 1000000000.
function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6
}

export interface ProvenanceOptions {
  /**
   * Check only numbers carrying a metric marker. Used for free prose (the
   * cover letter), where bare numbers are ordinary writing — "since 2014",
   * "10 years", "24/7", "level C1" — and demanding provenance for them
   * aborted honest letters. A fabricated METRIC still carries %, a currency
   * symbol or a scale word, which is what makes it a claim worth checking.
   */
  onlyMarked?: boolean
}

// Every number in `candidateText` must correspond to a real number in
// `trustedText`. Returns the ones that do not, so the caller can name them.
export function findUnsupportedNumbers(candidateText: string, trustedText: string, options: ProvenanceOptions = {}): number[] {
  const trusted = extractNumbers(trustedText)
  return parseNumbers(candidateText)
    .filter((candidate) => (options.onlyMarked ? candidate.marked : true))
    // An unreadable literal is reported rather than skipped when it is
    // marked as a metric: silently dropping it would be a hole in a guard
    // whose whole job is to refuse numbers it cannot account for.
    .filter((candidate) => Number.isNaN(candidate.value) ? candidate.marked : !trusted.some((real) => sameValue(real, candidate.value)))
    .map((candidate) => candidate.value)
}
