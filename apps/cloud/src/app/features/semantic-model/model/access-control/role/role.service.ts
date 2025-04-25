import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, inject } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { IModelRole, IUser, MDX } from '@metad/contracts'
import { Store, select, withProps } from '@ngneat/elf'
import { ToastrService } from '@cloud/app/@core'
import { isEqual, negate } from 'lodash-es'
import { createSubStore, dirtyCheckWith, write } from '../../../store'
import { SemanticModelService } from '../../model.service'
import { userLabel } from '@cloud/app/@shared/pipes'
import { I18nService } from '@cloud/app/@shared/i18n'

@Injectable()
export class RoleStateService {
  readonly #toastrService = inject(ToastrService)
  readonly #i18n = inject(I18nService)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.modelService.store,
    { name: 'semantic_model_role', arrayKey: 'key' },
    withProps<IModelRole>(null)
  )
  readonly pristineStore = createSubStore(
    this.modelService.pristineStore,
    { name: 'semantic_model_role_pristine', arrayKey: 'key' },
    withProps<IModelRole>(null)
  )

  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  readonly state$ = this.store
  public readonly schemaGrant$ = this.store.pipe(select((state) => state.options.schemaGrant))
  public readonly cubes$ = this.store.pipe(select((state) => state.options.schemaGrant?.cubeGrants))
  public readonly roleUsages$ = this.store.pipe(select((state) => state.options?.roleUsages))
  public readonly roleUsers$ = this.store.pipe(select((state) => state.users))

  constructor(public modelService: SemanticModelService) {}

  public init(key: string) {
    this.store.connect(['draft', 'roles', key])
    this.pristineStore.connect(['draft', 'roles', key])
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: IModelRole, ...params: OriginType[]) => IModelRole | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly updateSchemaGrant = this.updater((state, schemaGrant: Partial<MDX.SchemaGrant>) => {
    state.options.schemaGrant = {
      ...state.options.schemaGrant,
      ...schemaGrant
    }
  })

  readonly addCube = this.updater((state, cube: string) => {
    state.options.schemaGrant = state.options.schemaGrant ?? ({ cubeGrants: [] } as MDX.SchemaGrant)
    state.options.schemaGrant.cubeGrants = state.options.schemaGrant.cubeGrants ?? []
    if (state.options.schemaGrant.cubeGrants?.find((item) => item.cube === cube)) {
      this.#toastrService.warning(this.#i18n.instant('PAC.MODEL.AccessControl.CubeExists', {Default: 'The cube already exists'}))
    } else {
      state.options.schemaGrant.cubeGrants.push({
        cube,
        access: MDX.Access.all,
        hierarchyGrants: []
      })
    }
  })

  readonly removeCube = this.updater((state, name: string) => {
    const index = state.options.schemaGrant.cubeGrants.findIndex((item) => item.cube === name)
    if (index > -1) {
      state.options.schemaGrant.cubeGrants.splice(index, 1)
    }
  })

  readonly moveItemInCubes = this.updater((state, event: CdkDragDrop<any>) => {
    moveItemInArray(state.options.schemaGrant.cubeGrants, event.previousIndex, event.currentIndex)
  })

  readonly addUsers = this.updater((state, users: IUser[]) => {
    state.users = state.users ?? []
    users.forEach((user) => {
      if (state.users.find((item) => item.id === user.id)) {
        this.#toastrService.warning(
          'PAC.MODEL.AccessControl.UserExists', {Default: 'The user already exists'}
          , userLabel(user))
      } else {
        state.users.push(user)
      }
    })
  })

  readonly removeUser = this.updater((state, id: string) => {
    const index = state.users.findIndex((item) => item.id === id)
    if (index > -1) {
      state.users.splice(index, 1)
    }
  })

  readonly addRoleUsage = this.updater((state, { roleName, currentIndex }: any) => {
    const index = state.options.roleUsages.findIndex((name) => name === roleName)
    if (index > -1) {
      this.#toastrService.warning('PAC.MODEL.AccessControl.RoleExists', {Default: 'The role already exists'})
      return
    }

    state.options.roleUsages.splice(currentIndex, 0, roleName)
  })

  readonly removeRoleUsage = this.updater((state, name: string) => {
    const index = state.options.roleUsages.findIndex((item) => item === name)
    if (index > -1) {
      state.options.roleUsages.splice(index, 1)
    } else {
      this.#toastrService.error('PAC.MODEL.AccessControl.RoleNotExists', '', {Default: 'The role not exists'})
    }
  })

  readonly moveItemInRoleUsages = this.updater((state, event: CdkDragDrop<any>) => {
    moveItemInArray(state.options.roleUsages, event.previousIndex, event.currentIndex)
  })
}
