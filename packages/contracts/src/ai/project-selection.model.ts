/** Explicit first-send intent, mirrored by the ChatKit and Agent Protocol SDK contracts. */
export type ProjectSelection = { mode: 'auto-new' } | { mode: 'none' } | { mode: 'existing'; projectId: string }
