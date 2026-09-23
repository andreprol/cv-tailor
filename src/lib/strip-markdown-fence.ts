// claude-sonnet-5 sometimes wraps a JSON answer in a ```json ... ``` fence even
// when explicitly told to respond with only the JSON. Strip it before parsing.
export function stripMarkdownFence(text: string): string {
  // Greedy, anchored at the LAST closing fence: a lazy match stopped at the
  // first one, so a triple backtick inside a JSON string ("use ```bash…```")
  // cut the answer in half and the parse died on an unterminated string.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*)```/)
  if (fenced) return fenced[1].trim()
  // A truncated response (max_tokens reached mid-answer) has the OPENING
  // fence but no closing one, so the match above fails and the raw text goes
  // to JSON.parse, which reports a baffling "Unexpected token '`'" instead of
  // the real problem. Strip a dangling opening fence too — the parse still
  // fails on the truncated JSON, but with an error that points at the actual
  // truncation.
  const unterminated = text.match(/^\s*```(?:json)?\s*([\s\S]*)$/)
  return unterminated ? unterminated[1] : text
}

// A model writing prose into a JSON string field sometimes emits a REAL
// newline instead of the `\n` escape. RFC 8259 forbids raw control characters
// inside string literals, so JSON.parse rejects the entire answer — a whole
// generation thrown away over one byte, reported as an opaque "Bad control
// character in string literal". Seen twice in a handful of real runs against
// the production API.
//
// Escape those characters where they sit, leaving everything outside string
// literals untouched (indentation and line breaks BETWEEN tokens are legal
// JSON whitespace and must stay as they are, or offsets in later parse errors
// stop matching the model's actual output).
export function escapeRawControlChars(text: string): string {
  const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }
  let result = ''
  let insideString = false
  let afterBackslash = false

  for (const char of text) {
    if (afterBackslash) {
      // A backslash followed by a REAL newline is a line continuation the
      // model wrote by hand. Copying it through leaves `\` + raw control
      // char, which JSON.parse rejects with "Bad escaped character" — the
      // very failure this function exists to prevent, just one byte over.
      // Emit the escape and drop the pending backslash.
      if (char < ' ') {
        result = result.slice(0, -1) + (ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
        afterBackslash = false
        continue
      }
      result += char
      afterBackslash = false
      continue
    }
    if (char === '\\' && insideString) {
      result += char
      afterBackslash = true
      continue
    }
    if (char === '"') {
      insideString = !insideString
      result += char
      continue
    }
    if (insideString && char < ' ') {
      result += ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    }
    result += char
  }

  return result
}

// The one way model output should be turned into JSON in this codebase:
// unwrap the fence the model adds despite being told not to, repair raw
// control characters, then parse.
export function parseModelJson(raw: string): unknown {
  return JSON.parse(escapeRawControlChars(stripMarkdownFence(raw)))
}
