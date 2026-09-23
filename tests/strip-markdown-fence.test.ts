import { describe, it, expect } from 'vitest'
import { escapeRawControlChars, parseModelJson, stripMarkdownFence } from '../src/lib/strip-markdown-fence'

describe('stripMarkdownFence', () => {
  it('returns the text unchanged when there is no fence', () => {
    expect(stripMarkdownFence('{"a": 1}')).toBe('{"a": 1}')
  })

  it('strips a ```json fence', () => {
    expect(stripMarkdownFence('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('strips a plain ``` fence with no language tag', () => {
    expect(stripMarkdownFence('```\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('strips an opening fence with no closing one, which is what a truncated response looks like', () => {
    expect(stripMarkdownFence('```json\n{"a": 1')).toBe('{"a": 1')
  })
})

describe('escapeRawControlChars', () => {
  it('escapes a real newline written inside a string literal', () => {
    const raw = '{"letter": "Prezados,\nSegue minha candidatura."}'
    expect(() => JSON.parse(raw)).toThrow()
    expect(JSON.parse(escapeRawControlChars(raw)).letter).toBe('Prezados,\nSegue minha candidatura.')
  })

  it('leaves whitespace between tokens alone — that is legal JSON, not a control character in a string', () => {
    const pretty = '{\n  "a": 1,\n  "b": 2\n}'
    expect(escapeRawControlChars(pretty)).toBe(pretty)
  })

  it('does not double-escape a sequence the model already escaped correctly', () => {
    const raw = '{"a": "line\\nbreak"}'
    expect(escapeRawControlChars(raw)).toBe(raw)
    expect(JSON.parse(escapeRawControlChars(raw)).a).toBe('line\nbreak')
  })

  it('is not confused by an escaped quote inside a string', () => {
    const raw = '{"a": "ele disse \\"oi\\"", "b": 1}'
    expect(JSON.parse(escapeRawControlChars(raw))).toEqual({ a: 'ele disse "oi"', b: 1 })
  })

  it('is not confused by a trailing backslash before the closing quote', () => {
    const raw = '{"a": "caminho\\\\", "b": 1}'
    expect(JSON.parse(escapeRawControlChars(raw))).toEqual({ a: 'caminho\\', b: 1 })
  })

  it('repairs a backslash line continuation, not just a bare raw newline', () => {
    // `\` + real newline is what a model writes when it wraps a long string
    // by hand. Left alone it fails with "Bad escaped character".
    const raw = '{"a": "linha\\\ncontinua"}'
    expect(() => JSON.parse(raw)).toThrow()
    expect(JSON.parse(escapeRawControlChars(raw)).a).toBe('linha\ncontinua')
  })

  it('escapes tabs and carriage returns too', () => {
    expect(JSON.parse(escapeRawControlChars('{"a": "x\ty\r\nz"}')).a).toBe('x\ty\r\nz')
  })
})

describe('parseModelJson', () => {
  it('handles a fenced answer that also contains a raw newline inside a string', () => {
    const raw = '```json\n{"letter": "Prezados,\nSegue."}\n```'
    expect(parseModelJson(raw)).toEqual({ letter: 'Prezados,\nSegue.' })
  })
})
