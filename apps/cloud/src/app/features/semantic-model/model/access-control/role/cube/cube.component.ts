import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { MatButtonToggleChange } from '@angular/material/button-toggle'
import { MatRadioChange } from '@angular/material/radio'
import { MatSlideToggleChange } from '@angular/material/slide-toggle'
import { ActivatedRoute, Router } from '@angular/router'
import { MDX } from '@metad/contracts'
import { nonBlank } from '@metad/core'
import { injectCopilotCommand } from '@metad/copilot-angular'
import { EntitySchemaType } from '@metad/ocap-angular/entity'
import { AggregationRole, C_MEASURES, EntityType, getEntityHierarchy } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { SemanticModelService } from '../../../model.service'
import { RoleComponent } from '../role.component'
import { CubeStateService } from './cube.service'

/**
 * https://stackoverflow.com/questions/67337934/angular-nested-drag-and-drop-cdk-material-cdkdroplistgroup-cdkdroplist-nested
 * https://stackblitz.com/edit/angular-cdk-nested-drag-drop-tree-structure?file=src%2Fapp%2Fapp.component.html
 */
@Component({
  selector: 'pac-model-access-cube',
  templateUrl: 'cube.component.html',
  styleUrls: ['cube.component.scss'],
  providers: [CubeStateService]
})
export class CubeComponent {
  Access = MDX.Access
  RollupPolicy = MDX.RollupPolicy

  readonly #cubeState = inject(CubeStateService)
  readonly #modelService = inject(SemanticModelService)
  readonly #roleComponent = inject(RoleComponent)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly _cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(TranslateService)

  public cubeGrant: MDX.CubeGrant
  public entityType: EntityType
  private cubeName: string
  readonly cubeName$ = this.#route.paramMap.pipe(
    startWith(this.#route.snapshot.paramMap),
    map((paramMap) => paramMap.get('name')),
    filter(nonBlank),
    distinctUntilChanged()
  )

  public readonly cubeGrant$ = this.#cubeState.state$

  public readonly hierarchyGrants$ = this.cubeGrant$.pipe(map((cubeGrant) => cubeGrant.hierarchyGrants))

  get dropHierarchyPredicate() {
    return (event: CdkDrag<any>) => {
      if (event.data.type === EntitySchemaType.Member) {
        return event.data.raw?.cubeName === this.cubeName
      } else {
        return (
          event.data.cubeName === this.cubeName &&
          (event.data.role === AggregationRole.hierarchy ||
            event.data.role === AggregationRole.dimension ||
            event.data.role === AggregationRole.measure)
        )
      }
    }
  }

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #Command = injectCopilotCommand({
    name: 'role',
    description: this.#translate.instant('PAC.MODEL.Copilot.Examples.CreateNewRole', {
      Default: 'Describe the role you want to create'
    }),
    systemPrompt: async () => `Create or edit a role. 如何未提供 cube 信息，请先选择一个 cube`,
    actions: [
      // injectMakeCopilotActionable({
      //   name: 'select_cube',
      //   description: 'Select a cube',
      //   argumentAnnotations: [],
      //   implementation: async () => {}
      // })
    ]
  })
  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private cubeNameSub = this.cubeName$.pipe(takeUntilDestroyed()).subscribe((name) => {
    this.cubeName = name
    this.#cubeState.init(name)
    this.#roleComponent.selectedCube = name
  })

  private cubeGrantSub = this.cubeGrant$.pipe(takeUntilDestroyed()).subscribe((cubeGrant) => {
    this.cubeGrant = cubeGrant
  })

  private cubeSub = this.cubeGrant$
    .pipe(
      map((cubeGrant) => cubeGrant?.cube),
      filter(nonBlank),
      distinctUntilChanged(),
      switchMap((name) => this.#modelService.selectEntityType(name)),
      startWith(null),
      takeUntilDestroyed()
    )
    .subscribe((entityType) => {
      this.entityType = { ...entityType }
    })

  trackByName(index: number, item: MDX.HierarchyGrant) {
    return item.hierarchy
  }

  changeCubeAccess(event: MatRadioChange) {
    this.#cubeState.patchState({
      access: event.value
    })
  }

  dropHierarchy(event: CdkDragDrop<{ name: string }[]>) {
    if (event.item.data.type === EntitySchemaType.Member) {
      const hierarchy = getEntityHierarchy(this.entityType, event.item.data.raw.hierarchy)
      this.#cubeState.addMember({
        hierarchy: hierarchy.name,
        hierarchyCaption: hierarchy.caption,
        name: event.item.data.name,
        caption: event.item.data.caption
      })
    } else {
      if (event.item.data.role === AggregationRole.hierarchy || event.item.data.role === AggregationRole.dimension) {
        this.#cubeState.addHierarchy(event.item.data)
      } else if (event.item.data.role === AggregationRole.measure) {
        this.#cubeState.addMeasure({ measure: event.item.data.name, caption: event.item.data.measureCaption })
      }
    }
  }

  changeRollupPolicy(event: MatButtonToggleChange, hierarchy: string) {
    this.#cubeState.updateHierarchy({
      hierarchy,
      entity: {
        rollupPolicy: event.value
      }
    })
  }

  changeHierarchyAccess(event: MatButtonToggleChange, hierarchy: string) {
    const entity = {
      access: event.value
    } as MDX.HierarchyGrant

    if (entity.access !== MDX.Access.custom) {
      entity.memberGrants = []
    }
    this.#cubeState.updateHierarchy({
      hierarchy,
      entity
    })
  }

  removeHierarchy(name: string) {
    this.#cubeState.removeHierarchy(name)
  }

  getDropLevelPredicate(hierarchy: string) {
    return (event: CdkDrag<any>) => {
      return (
        event.data.cubeName === this.cubeName &&
        event.data.role === AggregationRole.level &&
        event.data.hierarchy === hierarchy
      )
    }
  }

  dropLevel(event: CdkDragDrop<{ name: string }[]>, type: 'topLevel' | 'bottomLevel', hierarchy: string) {
    if (event.item.data.role === AggregationRole.level) {
      this.#cubeState.updateHierarchy({
        hierarchy,
        entity: {
          [type]: event.item.data.name,
          [`${type}Caption`]: event.item.data.caption
        }
      })
    }
  }

  removeTopLevel(hierarchy: string) {
    this.#cubeState.updateHierarchy({
      hierarchy,
      entity: {
        topLevel: null,
        topLevelCaption: null
      }
    })
  }

  removeBottomLevel(hierarchy: string) {
    this.#cubeState.updateHierarchy({
      hierarchy,
      entity: {
        bottomLevel: null,
        bottomLevelCaption: null
      }
    })
  }

  dropMemberPredicate(hierarchy: string) {
    return (event: CdkDrag<any>) => {
      return (
        (event.data.type === EntitySchemaType.Member &&
          event.data.raw.hierarchy === hierarchy &&
          event.data.raw.cubeName === this.cubeName) ||
        (event.data.role === AggregationRole.measure &&
          event.data.cubeName === this.cubeName &&
          hierarchy === `[${C_MEASURES}]`)
      )
    }
  }

  dropMember(event: CdkDragDrop<{ name: string }[]>, hierarchyGrant: MDX.HierarchyGrant) {
    if (event.item.data.type === EntitySchemaType.Member) {
      this.#cubeState.addMember({
        hierarchy: hierarchyGrant.hierarchy,
        name: event.item.data.raw.memberUniqueName,
        caption: event.item.data.raw.memberCaption
      })
    } else if (event.item.data.role === AggregationRole.measure) {
      this.#cubeState.addMember({
        hierarchy: hierarchyGrant.hierarchy,
        name: event.item.data.measureUniqueName,
        caption: event.item.data.measureCaption
      })
    }
  }

  clearMembers(hierarchy: string) {
    this.#cubeState.removeMember({ hierarchy })
  }

  removeMember(hierarchy: string, member: string) {
    this.#cubeState.removeMember({
      hierarchy,
      member
    })
  }

  dropSortMember(event: CdkDragDrop<{ name: string }[]>, hierarchyGrant: MDX.HierarchyGrant) {
    this.#cubeState.moveMemberInArray({
      hierarchy: hierarchyGrant.hierarchy,
      event
    })
  }

  changeMemberAccess(event: MatSlideToggleChange, hierarchy: string, member: string) {
    this.#cubeState.updateMember({
      hierarchy,
      member,
      entity: {
        access: event.checked ? this.Access.all : this.Access.none
      }
    })
  }

  openedHierarchy(hierarchy: string) {
    this.#roleComponent.selectedHierarchy = hierarchy
  }
}
