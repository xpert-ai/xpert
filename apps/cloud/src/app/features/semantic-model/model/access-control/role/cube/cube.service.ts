import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, inject } from '@angular/core'
import { MDX } from '@metad/contracts'
import { C_MEASURES, PropertyHierarchy, serializeUniqueName } from '@metad/ocap-core'
import { withProps } from '@ngneat/elf'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'apps/cloud/src/app/@core'
import { createSubStore, write } from '../../../../store'
import { RoleStateService } from '../role.service'


@Injectable()
export class CubeStateService {
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly roleState = inject(RoleStateService)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.roleState.store,
    { name: 'semantic_model_role_cube', arrayKey: 'cube' },
    withProps<MDX.CubeGrant>(null)
  )
  readonly pristineStore = createSubStore(
    this.roleState.pristineStore,
    { name: 'semantic_model_role_cube_pristine', arrayKey: 'cube' },
    withProps<MDX.CubeGrant>(null)
  )

  readonly state$ = this.store.asObservable()

  public init(name: string) {
    this.store.connect(['options', 'schemaGrant', 'cubeGrants', name])
    this.pristineStore.connect(['options', 'schemaGrant', 'cubeGrants', name])
  }

  patchState(value: Partial<MDX.CubeGrant>) {
    this.store.update(write((state) => ({
      ...state,
      ...value
    })))
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: MDX.CubeGrant, ...params: OriginType[]) => MDX.CubeGrant | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly addHierarchy = this.updater((state, hierarchy: PropertyHierarchy) => {
    // check exists
    if (state.hierarchyGrants.find((item) => item.hierarchy === hierarchy.name)) {
      this.#toastr.warning('PAC.MODEL.AccessControl.DimensionHierarchyAlreadyExists', {
        Default: 'Dimension/hierarchy already exists!'
      })
    } else {
      state.hierarchyGrants.push({
        hierarchy: hierarchy.name,
        caption: hierarchy.caption,
        access: MDX.Access.custom,
        memberGrants: []
      } as MDX.HierarchyGrant)
    }
  })

  readonly updateHierarchy = this.updater(
    (state, { hierarchy, entity }: { hierarchy: string; entity: Partial<MDX.HierarchyGrant> }) => {
      const index = state.hierarchyGrants.findIndex((item) => item.hierarchy === hierarchy)
      if (index > -1) {
        state.hierarchyGrants[index] = {
          ...state.hierarchyGrants[index],
          ...entity
        }
      }
    }
  )

  readonly removeHierarchy = this.updater((state, name: string) => {
    const index = state.hierarchyGrants.findIndex((item) => item.hierarchy === name)
    if (index > -1) {
      state.hierarchyGrants.splice(index, 1)
    }
  })

  readonly addMember = this.updater(
    (
      state,
      {
        hierarchy,
        hierarchyCaption,
        name,
        caption
      }: { hierarchy: string; hierarchyCaption?: string; name: string; caption: string }
    ) => {
      const hierarchyGrant = state.hierarchyGrants.find((item) => item.hierarchy === hierarchy)
      if (hierarchyGrant) {
        if (hierarchyGrant.memberGrants.find((item) => item.member === name)) {
          this.#toastr.warning('PAC.MODEL.AccessControl.MemberAlreadyExists', { Default: 'Member already exists!' })
        } else {
          hierarchyGrant.memberGrants.push({
            member: name,
            caption: caption,
            access: MDX.Access.all
          })
        }
      } else {
        this.addHierarchy({
          name: hierarchy,
          caption: hierarchyCaption
        })

        this.addMember({
          hierarchy,
          name,
          caption
        })
      }
    }
  )

  readonly removeMember = this.updater((state, { hierarchy, member }: { hierarchy: string; member?: string }) => {
    const hierarchyGrant = state.hierarchyGrants.find((item) => item.hierarchy === hierarchy)
    if (member) {
      const index = hierarchyGrant.memberGrants.findIndex((item) => item.member === member)
      if (index > -1) {
        hierarchyGrant.memberGrants.splice(index, 1)
      }
    } else {
      hierarchyGrant.memberGrants = []
    }
  })

  readonly moveMemberInArray = this.updater(
    (state, { hierarchy, event }: { hierarchy: string; event: CdkDragDrop<{ name: string }[]> }) => {
      const hierarchyGrant = state.hierarchyGrants.find((item) => item.hierarchy === hierarchy)
      moveItemInArray(hierarchyGrant.memberGrants, event.previousIndex, event.currentIndex)
    }
  )

  readonly updateMember = this.updater(
    (state, { hierarchy, member, entity }: { hierarchy: string; member: string; entity: Partial<MDX.MemberGrant> }) => {
      const hierarchyGrant = state.hierarchyGrants.find((item) => item.hierarchy === hierarchy)
      const index = hierarchyGrant.memberGrants.findIndex((item) => item.member === member)
      if (index > -1) {
        hierarchyGrant.memberGrants[index] = {
          ...hierarchyGrant.memberGrants[index],
          ...entity
        }
      }
    }
  )

  readonly addMeasure = this.updater((state, { measure, caption }: any) => {
    const hierarchyName = `[${C_MEASURES}]`
    const measuresCaption = this.getTranslation('Ngm.EntitySchema.Measures', { Default: 'Measures' })
    // check exists
    let hierarchy = state.hierarchyGrants.find((item) => item.hierarchy === hierarchyName)
    if (!hierarchy) {
      hierarchy = {
        hierarchy: hierarchyName,
        caption: measuresCaption,
        access: MDX.Access.custom,
        memberGrants: []
      } as MDX.HierarchyGrant
      state.hierarchyGrants.push(hierarchy)
    }

    const memberUniqueName = serializeUniqueName(C_MEASURES, null, measure)
    if (hierarchy.memberGrants.find((item) => item.member === memberUniqueName)) {
      this.#toastr.warning(
        'PAC.MODEL.AccessControl.MeasureAlreadyExists',
        { Default: 'Measure already exists!' },
        measure
      )
    } else {
      hierarchy.memberGrants.push({
        member: memberUniqueName,
        caption,
        access: MDX.Access.all
      })
    }
  })

  getTranslation(key: string, params?: any) {
    return this.#translate.instant(key, params)
  }
}
