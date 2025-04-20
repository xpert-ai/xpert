import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop'
import { Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { IModelRole, MDX, RoleTypeEnum } from '@metad/contracts'
import { SplitterType } from '@metad/ocap-angular/common'
import { EntityCapacity } from '@metad/ocap-angular/entity'
import { combineLatestWith, distinctUntilChanged, filter, map, startWith } from 'rxjs/operators'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, SemanticModelEntity, SemanticModelEntityType } from '../../types'
import { AccessControlStateService } from '../access-control.service'
import { RoleStateService } from './role.service'

@Component({
  selector: 'pac-model-role',
  templateUrl: 'role.component.html',
  providers: [RoleStateService],
  styles: [
    `
      :host {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .pac-model-access__cubes {
        overflow-y: auto;
      }
      .mat-mdc-list {
        margin: 0 5px;
      }
      .mdc-list-item {
        --mdc-list-list-item-container-shape: 5px;
        &:hover {
          background-color: var(--ngm-color-primary-container-variant);
        }
      }
    `
  ]
})
export class RoleComponent {
  readonly destroyRef = inject(DestroyRef)

  Access = MDX.Access
  RoleTypeEnum = RoleTypeEnum
  EntityCapacity = EntityCapacity
  SplitterType = SplitterType

  role: IModelRole

  public readonly roleKey$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter((value) => !!value),
    distinctUntilChanged()
  )

  public readonly cubes$ = this.roleState.cubes$

  get dataSourceName() {
    return this.modelService.dataSource$.value?.options.key
  }

  selectedCube: string
  selectedHierarchy: string
  
  searchRoleControl = new FormControl()

  readonly roles$ = this.accessControlState.roles$.pipe(
    combineLatestWith(
      this.roleState.state$.pipe(
        map((role) => role.name),
        distinctUntilChanged()
      ),
      this.searchRoleControl.valueChanges.pipe(startWith(''))
    ),
    map(([roles, name, text]) =>
      roles.filter((item) => item.name !== name && (text ? item.name.toLowerCase().includes(text.toLowerCase()) : true))
    )
  )

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private roleSub = this.roleState.state$.pipe(takeUntilDestroyed()).subscribe((role) => {
    this.role = role
  })
  constructor(
    private roleState: RoleStateService,
    private accessControlState: AccessControlStateService,
    public modelService: SemanticModelService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.roleKey$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((key) => {
      this.roleState.init(key)
    })
  }

  trackByName(index: number, item: MDX.CubeGrant) {
    return item.cube
  }

  dropCubeEnterPredicate(item: CdkDrag<SemanticModelEntity>) {
    return (
      item.dropContainer.id === CdkDragDropContainers.Entities &&
      (item.data.type === SemanticModelEntityType.CUBE || item.data.type === SemanticModelEntityType.VirtualCube)
    )
  }

  dropCube(event: CdkDragDrop<{ name: string }[]>) {
    if (event.previousContainer === event.container) {
      this.roleState.moveItemInCubes(event)
    } else if (event.previousContainer.id === CdkDragDropContainers.Entities) {
      if (
        event.item.data.type === SemanticModelEntityType.CUBE ||
        event.item.data.type === SemanticModelEntityType.VirtualCube
      ) {
        this.roleState.addCube(event.item.data.name)
      }
    }
  }

  selectCube(cube: MDX.CubeGrant) {
    this.selectedCube = cube.cube
    this.router.navigate(['cube', cube.cube], { relativeTo: this.route })
  }

  cubeRemovePredicate(item: CdkDrag<any>) {
    return item.data?.type === 'Entity'
  }

  removeCube(event: CdkDragDrop<any[]>) {
    this.roleState.removeCube(event.item.data.name)
  }
}
