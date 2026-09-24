import { t } from './i18n'
import type { CatalogItem, ExpertItem } from './catalog-types'

// Uses the same category identifiers as the platform's Expert marketplace.
export const businessCategories = [
  ['featured', 'Featured solutions'],
  ['business-operations', 'Business & operations'],
  ['communication', 'Communication'],
  ['creativity', 'Creative design'],
  ['data-analytics', 'Data analysis'],
  ['developer-tools', 'Developer tools'],
  ['education-research', 'Education & research'],
  ['finance', 'Finance'],
  ['productivity', 'Productivity'],
  ['research', 'Research'],
  ['security', 'Security'],
  ['travel', 'Travel'],
  ['sales', 'Sales'],
  ['other', 'Other']
] as const
const labels = new Map<string, string>([
  ...businessCategories,
  ['Analysis', 'Data analysis'],
  ['Writing', 'Writing'],
  ['Workflow', 'Workflow'],
  ['Agent', 'Agent'],
  ['Assistant', 'Assistant'],
  ['Productivity', 'Productivity'],
  ['Xpert', 'Xpert'],
  ['tool-calling', 'Tool calling'],
  ['workflow', 'Workflow'],
  ['file-understanding', 'File understanding'],
  ['sandbox', 'Sandbox'],
  ['knowledge-retrieval', 'Knowledge retrieval'],
  ['external-xpert', 'Expert collaboration'],
  ['trigger', 'Triggers'],
  ['http', 'HTTP'],
  ['code', 'Code'],
  ['database', 'Database'],
  ['structured-output', 'Structured output']
])
export const categoryLabel = (value: string) => t(labels.get(value) || value)
export const canUseExpert = (item: ExpertItem) => ['owned', 'accessible', 'approved'].includes(item.access)
export function statusLabel(item: CatalogItem): string {
  if (item.kind === 'experts')
    return canUseExpert(item)
      ? t('Available now')
      : item.access === 'requested'
        ? t('Approval pending')
        : item.access === 'rejected'
          ? t('Can request again')
          : t('Access required')
  if (item.kind === 'templates') return t('Install to workspace')
  return {
    ready: t('Installed'),
    not_installed: t('Available to install'),
    initializing: t('Installing'),
    degraded: t('Repair needed'),
    failed: t('Installation failed')
  }[item.status]
}
export function actionLabel(item: CatalogItem): string {
  if (item.kind === 'experts')
    return canUseExpert(item)
      ? t('Use now')
      : item.access === 'requested'
        ? t('Awaiting approval')
        : t('Request access')
  if (item.kind === 'templates') return t('Initialize & install')
  return {
    ready: t('Use now'),
    not_installed: t('Install app'),
    initializing: t('View status'),
    degraded: t('Repair app'),
    failed: t('Reinstall')
  }[item.status]
}
