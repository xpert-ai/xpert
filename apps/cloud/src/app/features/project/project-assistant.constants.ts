import type { IXpert } from '@xpert-ai/contracts'

/**
 * Stable tag marker used by project-ready Assistant templates and existing Xperts.
 * The settings binding remains authoritative after selection; this marker only
 * controls which assistants are offered as candidates during setup.
 */
export const PROJECT_ASSISTANT_MARKER = 'project-assistant'
export const PROJECT_ASSISTANT_TEMPLATE_ID = 'xpert-project-assistant'

export function isProjectAssistant(xpert: Pick<IXpert, 'tags' | 'options'>): boolean {
  const templateId = xpert.options?.templateSource?.templateId?.trim().toLowerCase()
  return (
    templateId === PROJECT_ASSISTANT_TEMPLATE_ID ||
    templateId?.endsWith(`:${PROJECT_ASSISTANT_TEMPLATE_ID}`) === true ||
    Boolean(xpert.tags?.some((tag) => tag.name?.trim().toLowerCase() === PROJECT_ASSISTANT_MARKER))
  )
}
