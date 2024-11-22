import { inject } from '@angular/core'
import { IXpertWorkspace, XpertService } from '../../@core'

export function injectGetXpertTeam() {
  const xpertService = inject(XpertService)

  return (id: string) => {
    return xpertService.getTeam(id, {
      relations: [
        'agent',
        'agent.copilotModel',
        'agents',
        'agents.copilotModel',
        'executors',
        'executors.agent',
        'executors.copilotModel',
        'copilotModel'
      ]
    })
  }
}

export function injectGetXpertsByWorkspace() {
  const xpertService = inject(XpertService)

  return (workspace: IXpertWorkspace) => {
    return xpertService.getAllByWorkspace(workspace.id, { where: { latest: true } }, true)
  }
}
