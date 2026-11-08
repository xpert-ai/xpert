import { ARTIFACT_USE_GRANT_MANAGE_COMMAND } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod/v3'
import type { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import type { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'

const request = z
  .object({
    actionKey: z.enum([
      'group-grant-targets',
      'group-grants',
      'group-grant-offer',
      'group-grant-revoke',
      'group-grant-analysis-options'
    ]),
    input: z.object({ artifactId: z.string().uuid() }).passthrough()
  })
  .strict()

/** ChatKit never sees the normal login token. The source View repeats source/Project authorization. */
export function registerArtifactGrantAuthoringCommand(
  registry: ViewClientCommandRegistry,
  views: Pick<ViewExtensionApiService, 'executeAction'>
) {
  return registry.register(ARTIFACT_USE_GRANT_MANAGE_COMMAND, async (payload, context) => {
    const parsed = request.safeParse(payload)
    if (!parsed.success) return { success: false, code: 'bad_request' }
    if (
      context.hostType !== 'agent' ||
      !context.runtimeScope?.projectId ||
      context.runtimeScope.groupId ||
      !context.manifest?.clientCommands?.some((item) => item.key === ARTIFACT_USE_GRANT_MANAGE_COMMAND) ||
      !context.manifest.actions?.some((item) => item.key === parsed.data.actionKey)
    )
      return { success: false, code: 'forbidden' }
    return firstValueFrom(
      views.executeAction(
        context.hostType,
        context.hostId,
        context.viewKey,
        parsed.data.actionKey,
        { input: parsed.data.input },
        context.runtimeScope
      )
    )
  })
}
