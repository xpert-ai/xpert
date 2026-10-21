/** References are identities, never credentials, actor scope or mutable latest pointers. */
export type AnalyticsSourceRef =
  | { kind: 'data-source'; dataSourceId: string }
  | { kind: 'definition'; definitionId: string; versionId: string }
  | { kind: 'artifact'; artifactId: string; versionId: string }
export type AnalyticsVersionedSourceRef = Exclude<AnalyticsSourceRef, { kind: 'data-source' }>
