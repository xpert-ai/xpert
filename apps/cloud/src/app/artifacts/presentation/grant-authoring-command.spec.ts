import { of } from 'rxjs'
import { ARTIFACT_USE_GRANT_MANAGE_COMMAND } from '@xpert-ai/contracts'
import {
  ViewClientCommandRegistry,
  type ViewClientCommandContext
} from '../../@shared/view-extension/view-client-command-registry.service'
import { registerArtifactGrantAuthoringCommand } from './grant-authoring-command'

describe('Artifact grant authoring command', () => {
  const payload = { actionKey: 'group-grants', input: { artifactId: '8931648d-9303-437b-a5da-1778fe16fa93' } }
  const context: ViewClientCommandContext = {
    hostType: 'agent',
    hostId: 'assistant',
    viewKey: 'view',
    runtimeScope: { projectId: 'source' },
    manifest: {
      key: 'view',
      title: 'View',
      hostType: 'agent',
      slot: 'agent.workbench',
      view: { type: 'table' },
      clientCommands: [{ key: ARTIFACT_USE_GRANT_MANAGE_COMMAND }],
      actions: [{ key: 'group-grants', label: 'Grants', actionType: 'invoke' }]
    }
  }
  it('uses the normal host API and preserves the authoritative runtime scope', async () => {
    const registry = new ViewClientCommandRegistry(),
      executeAction = jest.fn().mockReturnValue(of({ success: true }))
    registerArtifactGrantAuthoringCommand(registry, { executeAction })
    expect(await registry.execute(ARTIFACT_USE_GRANT_MANAGE_COMMAND, payload, context)).toEqual({ success: true })
    expect(executeAction).toHaveBeenCalledWith(
      'agent',
      'assistant',
      'view',
      'group-grants',
      { input: payload.input },
      context.runtimeScope
    )
  })
  it('blocks unknown actions, missing project and undeclared host authority', async () => {
    const registry = new ViewClientCommandRegistry(),
      executeAction = jest.fn()
    registerArtifactGrantAuthoringCommand(registry, { executeAction })
    for (const [input, scope] of [
      [{ ...payload, actionKey: 'publish' }, context],
      [payload, { ...context, runtimeScope: undefined }],
      [payload, { ...context, runtimeScope: { projectId: 'source', groupId: 'group' } }],
      [payload, { ...context, manifest: { ...context.manifest, clientCommands: [] } }]
    ] as const) {
      expect(await registry.execute(ARTIFACT_USE_GRANT_MANAGE_COMMAND, input, scope)).toMatchObject({ success: false })
    }
    expect(executeAction).not.toHaveBeenCalled()
  })
})
