export interface IKeywordAnalyzerStrategy {
  readonly meta: {
    id: string
    label: string
    languages: string[]
    /** Change whenever index/query compatibility changes, including dictionary updates. */
    revision: string
  }

  /** Return ordered lexemes. The host encodes them as data, never as SQL or tsquery syntax. */
  analyze(text: string, purpose: 'index' | 'query'): Promise<readonly string[]>
}
