import { describe, it, expect } from 'vitest'
import { extractNumbers, findUnsupportedNumbers, parseNumbers } from '../src/lib/number-provenance'

describe('extractNumbers', () => {
  const cases: [string, number[]][] = [
    ['5%', [5]],
    ['224 endpoints', [224]],
    ['$1,000', [1000]],
    ['$1000', [1000]],
    ['R$ 1.500', [1500]],
    ['1,234,567', [1234567]],
    // The decimal comma is the case the first implementation got wrong: it
    // captured only the digits after the separator.
    ['2,5 milhões', [2_500_000]],
    ['2.5 million', [2_500_000]],
    ['25 milhões', [25_000_000]],
    ['US$200 mil', [200_000]],
    ['$200,000', [200_000]],
    ['200 thousand', [200_000]],
    ['200 thousands', [200_000]],
    ['2 billions', [2_000_000_000]],
    // A scale word is only a scale word when it ends there — "Milão" and
    // "milésimo" must not be read as "mil".
    ['2 Milão', [2]],
    ['1 milésimo', [1]],
    // Ambiguous suffixes count only on explicit money.
    ['US$5MM', [5_000_000]],
    ['200 mm', [200]],
    ['4K', [4]],
    ['$4K', [4_000]],
    // Trailing punctuation is not part of the number.
    ['custou 200.', [200]],
    // Mixed separators: the last one is the decimal point. Reading these as
    // pure grouping turned 1250 into 125000 — a hundredfold inflation that
    // then matched "$125,000".
    ['R$ 1.250,00', [1250]],
    ['$1,250.00', [1250]],
    ['R$ 1.234.567,89', [1234567.89]],
    ['12.345,67', [12345.67]],
    // Not a number at all: concatenating the digits invented values.
    ['1.2.3', []],
    ['0.0.0.1', []],
    ['v1.0.0 build 2', [2]],
    // Chained scale.
    ['2 mil milhões', [2_000_000_000]],
  ]

  for (const [text, expected] of cases) {
    it(`reads ${JSON.stringify(text)} as ${JSON.stringify(expected)}`, () => {
      expect(extractNumbers(text)).toEqual(expected)
    })
  }

  it('applies a range scale word to both ends of the range', () => {
    expect(extractNumbers('de 200 a 250 mil')).toEqual([200_000, 250_000])
    expect(extractNumbers('from 200 to 250 thousand')).toEqual([200_000, 250_000])
    expect(extractNumbers('de US$200 a US$250 mil')).toEqual([200_000, 250_000])
  })

  it('propagates through a whole enumeration, not only one step back', () => {
    expect(extractNumbers('de 100, 200 e 300 mil')).toEqual([100_000, 200_000, 300_000])
  })

  it('does not hand a scale to a number that is not part of the range', () => {
    // "2019" is a year sitting next to an unrelated figure. Scaling it would
    // put 2019000000 into the trusted set, a value that exists nowhere.
    expect(extractNumbers('Em 2019 e 5 milhões economizados')).toEqual([2019, 5_000_000])
    expect(extractNumbers('versão 2 e 3 mil usuários')).toEqual([2, 3_000])
  })

  it('does not leak a scale word across an unrelated sentence boundary', () => {
    expect(extractNumbers('Reduzi 30%. Entreguei 5 milhões')).toEqual([30, 5_000_000])
  })
})

describe('parseNumbers — metric marking', () => {
  it('marks numbers that carry a percent sign, a currency symbol or a scale word', () => {
    expect(parseNumbers('30%')[0].marked).toBe(true)
    expect(parseNumbers('US$200 mil')[0].marked).toBe(true)
    expect(parseNumbers('5 milhões')[0].marked).toBe(true)
    expect(parseNumbers('uma redução de 30 por cento')[0].marked).toBe(true)
  })

  it('leaves ordinary prose numbers unmarked, so free text is not policed', () => {
    for (const prose of ['desde 2014 lidero times', 'Atuo há 10 anos', 'disponibilidade 24/7', 'inglês nível C1', 'Node.js 20']) {
      expect(parseNumbers(prose).every((number) => !number.marked), prose).toBe(true)
    }
  })
})

describe('findUnsupportedNumbers', () => {
  const accepted: [string, string, string][] = [
    ['thousands separator added during translation', '$1000', '$1,000'],
    ['thousands separator removed', '$1,000', '$1000'],
    ['scale word expanded', '$200,000 to $25,000', 'Reduzi de US$200 mil para US$25 mil'],
    ['scale word introduced', 'Reduzi de US$200 mil para US$25 mil', '$200,000 to $25,000'],
    ['range with a single scale word', 'from 200,000 to 250,000', 'Orçamento de 200 a 250 mil'],
    ['decimal comma to decimal point', '2.5 million in savings', 'Economia de 2,5 milhões'],
    ['decimal expanded in full', '$2,500,000 in savings', 'Economia de 2,5 milhões'],
    ['percentage unchanged', 'cut costs by 5%', 'Reduzi custos em 5%'],
    ['percentage reworded', 'a 30 percent reduction', 'redução de 30%'],
  ]

  for (const [name, candidate, trusted] of accepted) {
    it(`accepts: ${name}`, () => {
      expect(findUnsupportedNumbers(candidate, trusted)).toEqual([])
    })
  }

  const rejected: [string, string, string][] = [
    // The hole the first implementation shipped: a tenfold inflation reading
    // as authentic because both sides collapsed to 25000000.
    ['tenfold inflation of a decimal', '25 milhões', 'Economia de 2,5 milhões'],
    ['tenfold inflation, other direction', '2,5 milhões', 'Economia de 25 milhões'],
    ['1,2 mil inflated to 12 mil', '12 mil', 'Economia de 1,2 mil'],
    ['5% claimed as 50%', 'cut costs by 50%', 'Reduzi custos em 5%'],
    ['order of magnitude on a plain number', '$10000', '$1,000'],
    ['a number that simply is not there', 'saved $900,000', 'Reduzi de US$200 mil para US$25 mil'],
    ['millimetres claimed as millions', '200 million units', 'entregamos 200 mm de cabo'],
    // The second hole: pt-BR currency with cents collapsing into a value a
    // hundred times larger.
    ['brazilian currency inflated a hundredfold', '$125,000 saved', 'Economia de R$ 1.250,00'],
    ['brazilian currency, other direction', 'Economia de R$ 1.250,00', '$125,000 saved'],
  ]

  for (const [name, candidate, trusted] of rejected) {
    it(`rejects: ${name}`, () => {
      expect(findUnsupportedNumbers(candidate, trusted).length).toBeGreaterThan(0)
    })
  }

  it('reports every unsupported number, not only the first', () => {
    expect(findUnsupportedNumbers('grew from 7 to 9', 'equipe de 5 pessoas')).toEqual([7, 9])
  })

  describe('onlyMarked — free prose', () => {
    const trusted = 'Reduzi o orçamento de TI em 30%. Liderei equipe de 12 pessoas.'

    it('leaves ordinary prose numbers alone, which used to abort honest cover letters', () => {
      for (const prose of [
        'Desde 2014 lidero times de tecnologia.',
        'Atuo há 10 anos na área.',
        'Mantive disponibilidade 24/7.',
        'Tenho inglês nível C1 e experiência com Node.js 20.',
        'Implantei SAP Business One 9.3 sob ISO 9001.',
      ]) {
        expect(findUnsupportedNumbers(prose, trusted, { onlyMarked: true }), prose).toEqual([])
      }
    })

    it('still catches a fabricated metric, which is what carries the reputational risk', () => {
      expect(findUnsupportedNumbers('Economizei US$3 milhões para a empresa.', trusted, { onlyMarked: true })).toEqual([3_000_000])
      expect(findUnsupportedNumbers('Reduzi custos em 80%.', trusted, { onlyMarked: true })).toEqual([80])
    })

    it('accepts a real metric written in the other language', () => {
      expect(findUnsupportedNumbers('I cut the IT budget by 30 percent.', trusted, { onlyMarked: true })).toEqual([])
    })
  })
})
