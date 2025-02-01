import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { createXpertGraph, TXpertTeamDraft, TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { firstValueFrom } from 'rxjs'
import { ToConnectionViewModelHandler } from '../../connection'
import { ToNodeViewModelHandler } from '../../node'
import { calculateHash, IStudioStore } from '../../types'
import { XpertStudioApiService } from '../../xpert-api.service'
import { ExpandTeamRequest } from './expand.request'

export class ExpandTeamHandler implements IHandler<ExpandTeamRequest> {
  constructor(
    private store: Store<StoreDef, IStudioStore>,
    private apiService: XpertStudioApiService
  ) {}

  public async handle(request: ExpandTeamRequest) {
    const xpertNode = getXpertNode(this.store.getValue().draft, request.key)
    let xpert = null
    // 还未加载 detail of xpert team
    if (!xpertNode.expanded && !xpertNode.entity.agents) {
      xpert = await firstValueFrom(this.apiService.getXpertTeam(request.key))
    }

    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const node = getXpertNode(draft, request.key)
      if (node) {
        node.expanded = !node.expanded
        if (node.expanded) {
          if (xpert) {
            node.entity = xpert
          }

          const {nodes, connections, size} = createXpertGraph(node.entity, node.position)
          // const { nodes, size } = new ToNodeViewModelHandler(node.entity, {position: node.position}).handle()
          node.nodes = nodes
          node.connections = connections
          node.size = size
          node.hash = calculateHash(JSON.stringify(size))
        } else {
          node.nodes = node.nodes.filter((_) => _.key === node.entity.agent.key)
          node.connections = null
          node.size = {
            width: (node.nodes[0].size?.width ?? 240) + 20,
            height: (node.nodes[0].size?.height ?? 100) + 50,
          }
          node.hash = calculateHash(JSON.stringify(node.size))
        }
      }

      return { draft }
    })
  }
}

function getXpertNode(draft: TXpertTeamDraft, key: string) {
  let node = null
  for (const item of draft.nodes) {
    if (item.key === key) {
      return item
    }
    if (item.type === 'xpert') {
      node = getXpertNode(item as any, key)
    }
    if (node) {
      return node
    }
  }
  return null
}
