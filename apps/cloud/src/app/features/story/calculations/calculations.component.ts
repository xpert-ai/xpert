import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, ViewContainerRef, computed, effect, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog, MatDialogModule } from '@angular/material/dialog'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ISelectOption, NgmDSCacheService, filterSearch } from '@metad/ocap-angular/core'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'
import { CalculationProperty, DisplayBehaviour, EntityType, ParameterProperty, Syntax, getEntityCalculations } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ConfirmDeleteComponent } from '@metad/components/confirm'
import { NxCoreService, nonBlank } from '@metad/core'
import { NxStoryService } from '@metad/story/core'
import { BehaviorSubject, combineLatestWith, firstValueFrom, map, of, share, shareReplay, switchMap, tap } from 'rxjs'
import { MatMenuModule } from '@angular/material/menu'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { ISemanticModel } from '../../../@core'
import { MatTooltipModule } from '@angular/material/tooltip'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslateModule,
    ScrollingModule,
    NgmCommonModule,
  ],
  selector: 'pac-story-calculations',
  templateUrl: 'calculations.component.html',
  styleUrls: ['calculations.component.scss'],
  host: {
    class: 'pac-story-calculations'
  }
})
export class StoryCalculationsComponent {
  DisplayBehaviour = DisplayBehaviour
  
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dsCoreService = inject(NgmDSCacheService)

  // entities: ISelectOption<string>[] = []
  readonly activeLink = signal<{ dataSource: string; entity: string }>(null)

  readonly #entitySchema = computed(() => {
    const { dataSource, entity } = this.activeLink() ?? {}
    return this.schemas$()?.[dataSource]?.[entity]
  })

  readonly parameters = computed<ParameterProperty[]>(() => Object.values(this.#entitySchema()?.parameters ?? {}))
  readonly calculations = computed<CalculationProperty[]>(() => getEntityCalculations(this.#entitySchema()))

  readonly dataSettings = computed(() => (this.activeLink() ? {
    dataSource: this.activeLink().dataSource,
    entitySet: this.activeLink().entity
  } : null))
  private schemas$ = toSignal(this.storyService.schemas$, { initialValue: null })

  public entities$ = computed(() => {
    const schemas = this.schemas$()
    if (schemas) {
      const entities = []

      Object.keys(schemas).forEach((dataSource) => {
        Object.keys(schemas[dataSource]).forEach((entity) => {
          entities.push({
            value: {dataSource},
            key: entity,
            caption: schemas[dataSource][entity].caption
          })
        })
      })
      return entities
    }

    return []
  })

  readonly newCubes = signal([])
  readonly entities = computed(() => {
    const items = [...this.entities$()]
    this.newCubes().forEach((cube) => {
      if (!items.find((item) => item.value.dataSource === cube.value.dataSource && item.key === cube.key)) {
        items.push(cube)
      }
    })
    return items
  })

  readonly entitySearch = model<string>('')
  readonly loadingCubes$ = new BehaviorSubject(false)
  readonly cubes$ = of(true).pipe(
    tap(() => this.loadingCubes$.next(true)),
    switchMap(() => this.storyService.modelCubes$.pipe(
      map((models) => {
        const items = []
        models.forEach((model, index) => {
          items.push(...model.cubes.map((cube) => ({ value: {
            dataSource: model.key,
            dataSourceId: model.value,
          }, key: cube.name, caption: cube.caption })))
        })
        return items
      }),
    )),
    tap(() => this.loadingCubes$.next(false)),
    shareReplay(1),
    combineLatestWith(toObservable(this.entities)),
    map(([cubes, items]) => cubes.filter((cube) => !items.find((item) => item.value.dataSource === cube.value.dataSource && item.key === cube.key))),
    combineLatestWith(toObservable(this.entitySearch)),
    map(([cubes, text]) => filterSearch(cubes, text)),
  )

  constructor(
    private storyService: NxStoryService,
    private coreService: NxCoreService,
    private readonly _dialog: MatDialog,
    private readonly _viewContainerRef: ViewContainerRef
  ) {
    effect(() => {
      const entities = this.entities$()
      if (!this.activeLink() && entities?.length > 0) {
        this.activeEntity(entities[0].value.dataSource, entities[0].key)
      }
    }, { allowSignalWrites: true })
  }

  activeEntity(dataSource: string, entity: string) {
    this.activeLink.set({ dataSource, entity })
  }

  trackByKey(index: number, item) {
    return item?.key
  }

  addCube(cube: ISelectOption<{dataSource: string}>) {
    this.newCubes.update((cubes) => [...cubes, {
      value: {
        dataSource: cube.value.dataSource,
      },
      key: cube.key,
      caption: cube.caption
    }])

    this.activeEntity(cube.value.dataSource, cube.key)
  }

  async openCreateParameter(name?: string) {
    const dataSettings = this.dataSettings()
    const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    this._dialog
        .open(NgmParameterCreateComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            dataSettings: dataSettings,
            entityType: entityType,
            coreService: this.coreService,
            name: name
          }
        })
        .afterClosed()
        .subscribe((result) => {
          if (result) {
            // 参数创建成功
            console.log(result)
          }
        })
  }

  removeParameter(parameter: string) {
    this.storyService.removeEntityParameter({
      dataSource: this.activeLink().dataSource,
      entity: this.activeLink().entity,
      parameter
    })
  }

  async openCreateCalculation() {

    this.router.navigate(['create'], { relativeTo: this.route })
    return

    // const dataSettings = {
    //   dataSource: this.activeLink().dataSource,
    //   entitySet: this.activeLink().entity
    // }
    // const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    // const data = {
    //   dataSettings,
    //   entityType,
    //   syntax: Syntax.MDX,
    //   coreService: this.coreService,
    //   value: null
    // }

    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<unknown, unknown, CalculationProperty>(CalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data
    //     })
    //     .afterClosed()
    // )
    // if (property) {
    //   this.storyService.addCalculationMeasure({ dataSettings, calculation: property })
    // }
  }

  async openEditCalculation(calculationProperty: CalculationProperty) {

    this.router.navigate([calculationProperty.__id__], { relativeTo: this.route, state: { value: calculationProperty } })
    return

    // const dataSettings = {
    //   dataSource: this.activeLink().dataSource,
    //   entitySet: this.activeLink().entity
    // }
    // const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<unknown, unknown, CalculationProperty>(CalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data: {
    //         dataSettings: dataSettings,
    //         entityType: entityType,
    //         value: calculationProperty,
    //         syntax: Syntax.MDX,
    //         coreService: this.coreService
    //       }
    //     })
    //     .afterClosed()
    // )

    // if (property) {
    //   this.storyService.updateCalculationMeasure({ dataSettings, calculation: property })
    // }
  }

  async removeCalculation(calculationProperty: CalculationProperty) {
    const confirm = await firstValueFrom(
      this._dialog
        .open(ConfirmDeleteComponent, { data: { value: calculationProperty.caption || calculationProperty.name } })
        .afterClosed()
    )
    if (confirm) {
      this.storyService.removeCalculation({
        dataSettings: { dataSource: this.activeLink().dataSource, entitySet: this.activeLink().entity },
        name: calculationProperty.name
      })
    }
  }

  close() {
    this.router.navigate(['../'], { relativeTo: this.route })
  }
}