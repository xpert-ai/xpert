import { WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

export const WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET = 'knowledgebase.documents'

export type WorkbenchNavigationOpenTarget = typeof WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET

export type WorkbenchNavigationOpenPayload = {
  target: WorkbenchNavigationOpenTarget
  knowledgebaseId: string
}

type WorkbenchNavigationOpenCommandOptions = {
  navigate?: (commands: string[]) => Promise<unknown> | unknown
}

export function registerWorkbenchNavigationOpenCommand(
  registry: ViewClientCommandRegistry,
  options: WorkbenchNavigationOpenCommandOptions = {}
) {
  return registry.register(WORKBENCH_NAVIGATION_OPEN_COMMAND, async (payload) => {
    const target = getString(payload, 'target')
    if (!target) {
      return {
        success: false,
        code: 'bad_request',
        message: 'Navigation target is required.'
      }
    }

    if (target !== WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET) {
      return {
        success: false,
        code: 'unsupported_target',
        message: `Navigation target '${target}' is not supported.`
      }
    }

    const knowledgebaseId = getString(payload, 'knowledgebaseId')
    if (!knowledgebaseId) {
      return {
        success: false,
        code: 'bad_request',
        message: 'Knowledgebase id is required.'
      }
    }

    if (!options.navigate) {
      return {
        success: false,
        code: 'unsupported',
        message: 'Workbench navigation is not available in this host.'
      }
    }

    await options.navigate(['/xpert/knowledges', knowledgebaseId, 'documents'])

    return {
      success: true,
      status: 'opened',
      target,
      knowledgebaseId
    }
  })
}

function getString(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
