import type { I18nObject, IconDefinition } from '../types'

/** Stable identity, independent of installation ids, labels and plugin versions. */
export interface XpertProjectTypeRef {
  applicationKey: string
  projectTypeKey: string
}

export const GENERAL_PROJECT_TYPE: XpertProjectTypeRef = {
  applicationKey: 'platform',
  projectTypeKey: 'general'
}

export interface XpertProjectTypeDefinition {
  key: string
  title: string | I18nObject
  icon?: IconDefinition
  /** Entity types delegate creation and lifecycle to their registered provider. */
  binding: { kind: 'project' } | { kind: 'entity'; providerKey: string }
}

export interface XpertProjectTypeSummary extends XpertProjectTypeRef {
  applicationTitle: string | I18nObject
  title: string | I18nObject
  icon?: IconDefinition
  binding: XpertProjectTypeDefinition['binding']
  available: boolean
}

export interface XpertProjectClassification {
  applicationKey?: string | null
  projectTypeKey?: string | null
  applicationInstallationId?: string | null
  /** Display-only snapshot survives plugin removal; never used for authorization. */
  projectTypeSnapshot?: Pick<XpertProjectTypeSummary, 'applicationTitle' | 'title' | 'binding'> | null
}

export interface XpertProjectListFilter {
  search?: string
  applicationKey?: string
  projectTypeKey?: string
  unclassified?: boolean
}

/** Resolved by the host and a trusted provider, never an arbitrary URL. */
export type XpertProjectEntry =
  | { kind: 'project'; projectId?: string; projectType: XpertProjectTypeRef }
  | { kind: 'assistant'; xpertId: string; slug: string; projectId?: string; viewKey: string; selectionId?: string }

export interface XpertProjectTypeCatalog {
  items: XpertProjectTypeSummary[]
  defaultProjectType?: XpertProjectTypeRef
}
