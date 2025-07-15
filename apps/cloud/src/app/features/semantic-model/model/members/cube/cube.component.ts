import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, viewChild, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { SemanticModelServerService } from '@metad/cloud/state'
import { CdkConfirmDeleteComponent, NgmCheckboxComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { Cube, EntityType, FilterSelectionType, Property, getEntityDimensions, getEntityHierarchy } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ISemanticModelEntity,
  ModelEntityType,
  SemanticModelEntityService,
  getErrorMessage,
  injectToastr,
  tryHttp
} from 'apps/cloud/src/app/@core'
import { uniq } from 'lodash-es'
import { EMPTY, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs'
import { Dialog } from '@angular/cdk/dialog'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NgmValueHelpComponent } from '@metad/ocap-angular/controls'
import { SemanticModelService } from '../../model.service'
import { ModelMembersRetrievalTestingComponent } from '../retrieval/retrieval.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatIconModule,
    MatExpansionModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    DensityDirective,
    AppearanceDirective,
    NgmCheckboxComponent,
  ],
  selector: 'pac-model-members-cube',
  templateUrl: 'cube.component.html',
  styleUrl: 'cube.component.scss'
})
export class ModelMembersCubeComponent {
  readonly modelService = inject(SemanticModelService)
  readonly modelEntityService = inject(SemanticModelEntityService)
  readonly modelsService = inject(SemanticModelServerService)
  readonly dialog = inject(MatDialog)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly translate = inject(TranslateService)
  readonly viewContainerRef = inject(ViewContainerRef)

  readonly semanticModelKey = toSignal(this.modelService.semanticModelKey$)

  readonly cube = model<
    Cube & {
      entityType?: EntityType
      __entity__: ISemanticModelEntity
    }
  >(null)

  readonly dimensions = computed<Array<Property & { expand?: boolean }>>(() =>
    this.cube() ? getEntityDimensions(this.cube().entityType) : []
  )
  readonly selectedDims = model<string[]>(null)
  readonly allSelected = signal(false)

  readonly loaded = signal(false)
  readonly loading = signal(false)
  readonly refreshing = signal(false)

  readonly members = signal({})

  readonly someSelected = computed(() => {
    const selectedDims = this.selectedDims()
    const dimensions = this.cube()?.dimensions
    if (!dimensions) {
      return false
    }

    return dimensions.some((dim) => selectedDims?.includes(dim.name)) && !this.allSelected()
  })

  readonly entity = computed(() => this.cube()?.__entity__)
  readonly syncMembers = computed(() => this.entity()?.options?.members ?? {})
  readonly job = computed(() => this.cube()?.__entity__?.job)

  readonly delayRefresh$ = new Subject<boolean>()
  
  constructor() {
    effect(
      () => {
        if (this.entity() && !this.selectedDims()) {
          this.selectedDims.set(this.entity()?.options?.vector?.hierarchies ?? [])
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.job()?.status ==='processing') {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refreshStatus())
  }

  getSelected(name: string) {
    return this.selectedDims()?.includes(name)
  }
  setSelected(name: string, value: boolean) {
    if (value && !this.selectedDims()?.includes(name)) {
      this.selectedDims.update((values) => [...(values ?? []), name])
    }
    if (!value) {
      this.selectedDims.update((values) => values?.filter((_) => _ !== name))
    }
  }

  setAll(completed: boolean) {
    this.allSelected.set(completed)

    if (!this.dimensions()?.length) {
      return
    }

    this.allSelected() ? this.selectAll() : this.deselectAll()
  }

  selectAll() {
    const names = []
    this.dimensions().forEach((dim) => {
      dim.hierarchies.forEach((h) => {
        names.push(h.name)
      })
    })
    this.selectedDims.set(names)
  }

  deselectAll() {
    this.selectedDims.set([])
  }

  async refresh() {
    const cube = this.cube().name

    this.refreshing.set(true)

    if (this.selectedDims()) {
      for (const name of this.selectedDims()) {
        let storeMembers = []
        const hierarchy = getEntityHierarchy(this.cube().entityType, name)
        if (!hierarchy) {
          this.#toastr.error('PAC.MODEL.CanntFoundHierarchy', null, {
            Default: `Can't found hierarchy '${name}'`,
            value: name
          })
        } else {
          const members = await tryHttp(
            this.modelService.selectHierarchyMembers(cube, {
              dimension: hierarchy.dimension,
              hierarchy: hierarchy.name
            }),
            this.#toastr
          )
          
          if (members) {
            storeMembers = storeMembers.concat(members)
          }

          this.members.update((members) => ({
            ...members,
            [name]: storeMembers
          }))
        }
      }
      this.loaded.set(true)
    }

    this.refreshing.set(false)
  }

  refreshStatus() {
    if (this.entity()?.id) {
      this.modelEntityService.getOne(this.entity().id).subscribe((entity) => {
        this.cube.update((cube) => ({ ...cube, __entity__: entity }))
      })
    }
  }

  async createModelEntity(dimensions: string[]) {
    const cube = this.cube().name
    this.loading.set(true)

    this.modelEntityService
      .create(this.modelService.modelSignal().id, {
        name: cube,
        caption: this.cube().caption,
        type: ModelEntityType.Cube,
        options: {
          vector: {
            hierarchies: uniq(dimensions)
          }
        }
      })
      .subscribe({
        next: (entity) => {
          this.cube.update((cube) => ({ ...cube, __entity__: entity }))
          this.#toastr.success('PAC.MODEL.SynchronizationJobCreatedSuccessfully', { Default: 'Synchronization job created successfully!' })
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
          this.loading.set(false)
        },
        complete: () => {
          this.loading.set(false)
        }
      })
  }

  stopJob() {
    this.loading.set(true)
    this.modelEntityService.stopJob(this.entity().id).subscribe({
      next: (entity) => {
        this.loading.set(false)
        this.cube.update((cube) => ({ ...cube, __entity__: entity }))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  deleteMembers(id: string) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: this.cube().caption,
          information: this.translate.instant('PAC.MODEL.SureDeleteDimensionMembers', {
            Default: 'Are you sure to delete the synced dimension members in this cube?'
          })
        }
      })
      .closed
      .pipe(
        switchMap((confirm) =>
          confirm
            ? this.modelEntityService.delete(id).pipe(
                tap(() => {
                  this.cube.update((state) => ({ ...state, __entity__: null }))
                  this.#toastr.success('PAC.MODEL.DeletedSuccessfully', { Default: 'Deleted Successfully!' })
                }),
                catchError((err) => {
                  this.#toastr.error(getErrorMessage(err))
                  return EMPTY
                })
              )
            : EMPTY
        )
      )
      .subscribe()
  }

  openValueHelp(dimension: string, hierarchy: string) {
    this.dialog
      .open(NgmValueHelpComponent, {
        viewContainerRef: this.viewContainerRef,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          dataSettings: {
            dataSource: this.semanticModelKey(),
            entitySet: this.cube().name
          },
          dimension: {
            dimension,
            hierarchy
          },
          options: {
            selectionType: FilterSelectionType.Multiple,
            searchable: true,
            initialLevel: 1
          }
        }
      })
      .afterClosed()
  }

  retrievalTesting() {
    this.#dialog.open(ModelMembersRetrievalTestingComponent, {
      viewContainerRef: this.viewContainerRef,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        modelId: this.modelService.modelSignal().id,
        cube: this.cube()
      }
    }).closed.subscribe((result) => {
      if (result) {
      }
    })
  }
}
