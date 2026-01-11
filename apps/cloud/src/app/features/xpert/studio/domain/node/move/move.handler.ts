import { IHandler } from '@foblex/mediator'
import { Store, StoreDef } from '@ngneat/elf'
import { calculateHash } from '@cloud/app/@shared/utils'
import { omit } from 'lodash-es'
import { IStudioStore } from '../../types'
import { MoveNodeRequest } from './move.request'

export class MoveNodeHandler implements IHandler<MoveNodeRequest> {
  constructor(private store: Store<StoreDef, IStudioStore>) {}

  public handle(request: MoveNodeRequest): void {
    this.store.update((s) => {
      const draft = structuredClone(s.draft)

      let _node = null
      for (const node of draft.nodes) {
        if (node.key === request.key) {
          _node = node
        }
        if (_node) {
          break
        }
        if (node.type === 'xpert' && node.nodes) {
          for (const sub of node.nodes) {
            if (sub.key === request.key) {
              _node = sub
            }
            if (_node) {
              break
            }
          }
        }
      }

      if (_node) {
        _node.position = {
          ...(_node.position ?? {}),
          ...request.position
        }
        if (request.position.width && request.position.height) {
          if (_node.type === 'workflow' && _node.entity.type === 'note') {
            _node.size = {
              width: request.position.width,
              height: request.position.height
            }
          }
        }

        _node.hash = calculateHash(JSON.stringify(omit(_node, 'hash')))
      } else {
        console.warn(`Node with key ${request.key} not found`)
      }
      
      return { draft }
    })
  }
}
