export const DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER = 'basic'

/** Persisted analysis identity. A revision covers algorithm, normalization and dictionaries. */
export interface KnowledgeKeywordAnalyzer {
  provider: string
  revision: string
  source: { kind: 'builtin' } | { kind: 'plugin'; pluginName: string; scopeKey: string }
}

export interface KnowledgeKeywordAnalyzerOption {
  label: string
  languages: string[]
  analyzer: KnowledgeKeywordAnalyzer
}
