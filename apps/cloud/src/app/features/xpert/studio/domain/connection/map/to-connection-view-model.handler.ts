import { IHandler } from '@foblex/mediator'
import { createAgentConnections, IXpert, TXpertTeamConnection } from '../../../../../../@core/types'

export class ToConnectionViewModelHandler implements IHandler<void, TXpertTeamConnection[]> {
  constructor(private team: IXpert) {}

  public handle(): TXpertTeamConnection[] {
    const xpert = this.team
    const connections: TXpertTeamConnection[] = []

    connections.push(...createAgentConnections(xpert.agent, this.team.executors))
    for (const agent of xpert.agents ?? []) {
      connections.push(...createAgentConnections(agent, this.team.executors))
    }

    return connections
  }
}

// function createAgentConnections(agent: IXpertAgent, collaborators: IXpert[]) {
//   const connections = []
//   const from = agent.leaderKey
//   const to = agent.key
//   if (from && to) {
//     connections.push({
//       type: 'agent',
//       key: from + '/' + to,
//       from,
//       to
//     })
//   }

//   // collaborators
//   agent.collaboratorNames?.forEach((name) => {
//     const collaborator = collaborators.find((_) => _.name === name)
//     if (collaborator) {
//       const from = agent.key
//       const to = collaborator.id
//       connections.push({
//         type: 'xpert',
//         key: from + '/' + to,
//         from,
//         to
//       })
//     }
//   })

//   // knowledgebases
//   agent.knowledgebaseIds?.forEach((knowledgebaseId) => {
//     const from = agent.key
//     const to = knowledgebaseId
//     connections.push({
//       type: 'knowledge',
//       key: from + '/' + to,
//       from,
//       to
//     })
//   })

//   // toolsets
//   agent.toolsetIds?.forEach((toolsetId) => {
//     const from = agent.key
//     const to = toolsetId
//     connections.push({
//       type: 'toolset',
//       key: from + '/' + to,
//       from,
//       to
//     })
//   })

//   return connections
// }