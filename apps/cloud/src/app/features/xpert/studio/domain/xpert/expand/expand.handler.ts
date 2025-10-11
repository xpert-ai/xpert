import { calculateHash } from '@cloud/app/@shared/utils'
import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import {
  createXpertGraph,
  IXpert,
  TXpertGraph,
  TXpertTeamDraft,
  TXpertTeamNode,
} from 'apps/cloud/src/app/@core'
import { assign } from 'lodash'
import { firstValueFrom } from 'rxjs'
import { IStudioStore } from '../../types'
import { XpertStudioApiService } from '../../xpert-api.service'
import { ExpandTeamRequest } from './expand.request'
import { createXpertNode } from '../types'

export class ExpandTeamHandler implements IHandler<ExpandTeamRequest> {
  constructor(
    private store: Store<StoreDef, IStudioStore>,
    private apiService: XpertStudioApiService
  ) {}

  public async handle(request: ExpandTeamRequest) {
    const xpertNode = getXpertNode<TXpertTeamNode & { expanded: boolean }>(this.store.getValue().draft, request.key)
    let xpert = null
    // Not loaded detail of xpert team yet
    if (!xpertNode.expanded && !(<IXpert>xpertNode.entity).agents) {
      xpert = await firstValueFrom(this.apiService.getXpertTeam(request.key))
    }

    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const node = getXpertNode<TXpertTeamNode & TXpertGraph & { expanded: boolean }>(draft, request.key)
      if (node) {
        node.expanded = !node.expanded
        if (node.expanded) {
          if (xpert) {
            node.entity = xpert
          }

          const { nodes, connections, size } = createXpertGraph(node.entity as IXpert, node.position)
          // const { nodes, size } = new ToNodeViewModelHandler(node.entity, {position: node.position}).handle()
          node.nodes = nodes
          node.connections = connections
          node.size = size
          node.hash = calculateHash(JSON.stringify(size))
        } else {
          assign(node, createXpertNode(node.entity as IXpert, node.position))
          node.connections = null
        }
      }

      return { draft }
    })
  }
}

function getXpertNode<T extends TXpertTeamNode>(draft: TXpertTeamDraft, key: string): T | null {
  let node = null
  for (const item of draft.nodes) {
    if (item.key === key) {
      return item as T
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
