import { WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import {
  registerWorkbenchNavigationOpenCommand,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET
} from './workbench-navigation-open-client-command'

const context = {
  hostType: 'agent',
  hostId: 'assistant-1',
  viewKey: 'knowledge-workbench',
  manifest: {
    key: 'knowledge-workbench'
  }
} as any

describe('registerWorkbenchNavigationOpenCommand', () => {
  it('navigates to the knowledgebase documents page', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn(async () => true)
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
        knowledgebaseId: 'kb-1'
      },
      context
    )

    expect(navigate).toHaveBeenCalledWith(['/xpert/knowledges', 'kb-1', 'documents'])
    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
      knowledgebaseId: 'kb-1'
    })
  })

  it('rejects missing knowledgebase id', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn()
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'bad_request'
      })
    )
  })

  it('rejects unsupported navigation targets', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn()
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: 'settings.billing',
        knowledgebaseId: 'kb-1'
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'unsupported_target'
      })
    )
  })
})
