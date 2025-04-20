import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, inject } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { IModelRole, MDX } from '@metad/contracts'
import { withProps } from '@ngneat/elf'
import { includes, isEqual, negate } from 'lodash-es'
import { createSubStore, dirtyCheckWith, write } from '../../store'
import { SemanticModelService } from '../model.service'
import { filter } from 'rxjs'

@Injectable()
export class AccessControlStateService {
  readonly modelService = inject(SemanticModelService)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.modelService.store,
    { name: 'semantic_model_roles', arrayKey: 'key' },
    withProps<IModelRole[]>([])
  )
  readonly pristineStore = createSubStore(
    this.modelService.pristineStore,
    { name: 'semantic_model_roles_pristine', arrayKey: 'key' },
    withProps<IModelRole[]>([])
  )

  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  get roles() {
    return this.store.state
  }

  readonly state$ = this.store.pipe(filter((state) => Array.isArray(state)))
  readonly roles$ = this.state$

  constructor() {
    this.store.connect(['draft', 'roles'])
    this.pristineStore.connect(['draft', 'roles'])
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: IModelRole[], ...params: OriginType[]) => IModelRole[] | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  // Updaters for Roles
  readonly addRole = this.updater((state, role: IModelRole) => {
    const options =
      role.options ??
      (role.type === 'union'
        ? { name: '', roleUsages: [] }
        : {
            name: '',
            schemaGrant: {
              access: MDX.Access.all,
              cubeGrants: []
            }
          })
    state.push({
      ...role,
      options: options as MDX.Role,
      users: []
    })
  })

  readonly removeRole = this.updater((state, key: string) => {
    const index = state.findIndex((item) => item.key === key)
    if (index > -1) {
      state.splice(index, 1)
    }
  })

  readonly moveRoleInArray = this.updater((state, event: CdkDragDrop<IModelRole[]>) => {
    moveItemInArray(state, event.previousIndex, event.currentIndex)
  })

  readonly changeUserRoles = this.updater((state, { user, roles }: any) => {
    state.forEach((role: IModelRole) => {
      if (includes(roles, role.name)) {
        if (!role.users.find((item) => item.id === user.id)) {
          role.users.push(user)
        }
      } else {
        const index = role.users.findIndex((item) => item.id === user.id)
        if (index > -1) {
          role.users.splice(index, 1)
        }
      }
    })
  })

  readonly removeUser = this.updater((state, id: string) => {
    state.forEach((role: IModelRole) => {
      const index = role.users.findIndex((item) => item.id === id)
      if (index > -1) {
        role.users.splice(index, 1)
      }
    })
  })
}
