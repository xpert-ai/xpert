import type { TemplateItem } from '../catalog-types'
import { t } from '../i18n'

/** Reserved host seed, resolved against the serving distribution's capability registry. */
export function blankAssistant(): TemplateItem {
  return {
    id: 'xpert-blank-assistant',
    kind: 'templates',
    source: 'builtin',
    name: t('New digital expert'),
    description: t('Start with a blank assistant. Choose its model and enable only the capabilities you need.'),
    avatarUrl: null,
    avatarEmoji: null,
    publisher: 'Xpert',
    categories: [],
    tags: []
  }
}
