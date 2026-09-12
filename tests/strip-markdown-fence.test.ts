import { describe, it, expect } from 'vitest'
import { stripMarkdownFence } from '../src/lib/strip-markdown-fence'

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
})
