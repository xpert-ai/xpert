import { IHandler } from '@foblex/mediator'
import { createAgentConnections, IXpert, TXpertTeamConnection } from '../../../../../../@core/types'

export class ToConnectionViewModelHandler implements IHandler<void, TXpertTeamConnection[]> {
  constructor(private team: IXpert) {}

  public handle(): TXpertTeamConnection[] {
    const xpert = this.team
    const connections: TXpertTeamConnection[] = []

    if (!xpert.agent.options?.hidden) {
      connections.push(...createAgentConnections(xpert.agent, this.team.executors))
    }
    for (const agent of xpert.agents ?? []) {
      connections.push(...createAgentConnections(agent, this.team.executors))
    }

    return connections
  }
}
