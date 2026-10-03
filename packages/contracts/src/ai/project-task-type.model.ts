import type { I18nObject } from '../i18n.model'

/** Portable presentation tokens. Clients render their own trusted icon components. */
export const PROJECT_TASK_ICON_NAMES = [
  'FileText',
  'FileScan',
  'FileSearch',
  'ListChecks',
  'ListTree',
  'ShieldCheck',
  'FilePenLine',
  'Workflow',
  'Images',
  'FolderInput',
  'FileOutput'
] as const
export type ProjectTaskIconName = (typeof PROJECT_TASK_ICON_NAMES)[number]

export interface ProjectTaskTypePresentation {
  label: I18nObject
  icon: ProjectTaskIconName
}

export interface ProjectTaskTypeDefinition {
  /** Namespaced by the owning task provider, for example bid.tasks.illustration. */
  key: string
  presentation: ProjectTaskTypePresentation
}
