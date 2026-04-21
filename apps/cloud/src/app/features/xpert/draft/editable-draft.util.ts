import { omit } from 'lodash-es'
import { normalizeMiddlewareNodes, type IXpert, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { ToConnectionViewModelHandler } from '../studio/domain/connection/map/to-connection-view-model.handler'
import { ToNodeViewModelHandler } from '../studio/domain/node/map/to-view-model.handler'

export function buildEditableXpertDraft(xpert: IXpert): TXpertTeamDraft {
  const baseTeam = {
    ...omit(xpert, 'agents'),
    id: xpert.id
  }

  if (xpert.draft) {
    return {
      team: {
        ...baseTeam,
        ...(xpert.draft.team ?? {}),
        id: xpert.draft.team?.id ?? xpert.id
      },
      nodes: normalizeMiddlewareNodes(
        xpert.draft.nodes ?? xpert.graph?.nodes ?? new ToNodeViewModelHandler(xpert).handle().nodes
      ),
      connections: xpert.draft.connections ?? xpert.graph?.connections ?? new ToConnectionViewModelHandler(xpert).handle()
    }
  }

  return {
    team: baseTeam,
    nodes: normalizeMiddlewareNodes(xpert.graph?.nodes ?? new ToNodeViewModelHandler(xpert).handle().nodes),
    connections: xpert.graph?.connections ?? new ToConnectionViewModelHandler(xpert).handle()
  } as TXpertTeamDraft
}
