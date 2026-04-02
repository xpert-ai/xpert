import { omit } from 'lodash-es'
import { IXpert, TXpertTeamDraft } from '../../@core'
import { ToConnectionViewModelHandler } from './studio/domain/connection'
import { ToNodeViewModelHandler } from './studio/domain/node'

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
      nodes: xpert.draft.nodes ?? xpert.graph?.nodes ?? new ToNodeViewModelHandler(xpert).handle().nodes,
      connections: xpert.draft.connections ?? xpert.graph?.connections ?? new ToConnectionViewModelHandler(xpert).handle()
    }
  }

  return {
    team: baseTeam,
    ...(xpert.graph ?? {
      nodes: new ToNodeViewModelHandler(xpert).handle().nodes,
      connections: new ToConnectionViewModelHandler(xpert).handle()
    })
  } as TXpertTeamDraft
}
