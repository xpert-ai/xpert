import { ARTIFACT_PRESENTATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import type { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

const requestSchema = z.object({ url: z.string().url() }).strict()

/** Opens only the platform's authenticated Artifact viewer; the page rechecks access. */
export function registerArtifactPresentationOpenCommand(registry: ViewClientCommandRegistry) {
  return registry.register(ARTIFACT_PRESENTATION_OPEN_COMMAND, (payload, context) => {
    if (!context.manifest?.clientCommands?.some((command) => command.key === ARTIFACT_PRESENTATION_OPEN_COMMAND))
      return { success: false, code: 'forbidden' }
    const parsed = requestSchema.safeParse(payload)
    if (!parsed.success) return { success: false, code: 'bad_request' }
    const url = new URL(parsed.data.url)
    if (
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/artifacts\/view\/[a-zA-Z0-9_-]{1,128}$/.test(url.pathname)
    )
      return { success: false, code: 'bad_request' }
    const popup = window.open('about:blank', '_blank')
    if (!popup) return { success: false, code: 'popup_blocked' }
    popup.opener = null
    popup.location.replace(url.href)
    return { success: true }
  })
}
