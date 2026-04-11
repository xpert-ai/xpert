import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import { Component, ViewContainerRef, computed, effect, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'

import { ZardButtonComponent, ZardDialogModule, ZardDialogService, ZardDividerComponent, ZardIconComponent, ZardMenuImports, ZardProgressBarComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule, NgmConfirmDeleteService } from '@xpert-ai/ocap-angular/common'
import { ISelectOption, filterSearch } from '@xpert-ai/ocap-angular/core'
import { NgmParameterCreateComponent } from '@xpert-ai/ocap-angular/parameter'
import { CalculationProperty, DisplayBehaviour, ParameterProperty, getEntityCalculations } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, combineLatestWith, firstValueFrom, map, of, shareReplay, switchMap, tap } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    RouterModule,
    ZardDialogModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardDividerComponent,
    ZardProgressBarComponent,
    ...ZardMenuImports,
    ...ZardTooltipImports,
    TranslateModule,
    ScrollingModule,
    NgmCommonModule
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
  readonly #dialog = inject(Dialog)
  readonly #confirmDelete = inject(NgmConfirmDeleteService)
  // readonly dsCoreService = inject(NgmDSCacheService)

  readonly activeLink = signal<{ dataSource: string; modelId: string; entity: string }>(null)

  readonly #entitySchema = computed(() => {
    const { dataSource, entity } = this.activeLink() ?? {}
    return this.schemas$()?.[dataSource]?.[entity]
  })

  readonly parameters = computed<ParameterProperty[]>(() => Object.values(this.#entitySchema()?.parameters ?? {}))
  readonly calculations = computed<CalculationProperty[]>(() => getEntityCalculations(this.#entitySchema()))

  readonly dataSettings = computed(() =>
    this.activeLink()
      ? {
          dataSource: this.activeLink().dataSource,
          entitySet: this.activeLink().entity,
          modelId: this.activeLink().modelId
        }
      : null
  )
  private schemas$ = toSignal(this.storyService.schemas$, { initialValue: null })

  public entities$ = computed<ISelectOption<{ dataSource: string; modelId: string }>[]>(() => {
    const schemas = this.schemas$()
    const dataSources = this.storyService.dataSources()
    if (schemas) {
      const entities = []

      Object.keys(schemas).forEach((dataSource) => {
        Object.keys(schemas[dataSource]).forEach((entity) => {
          entities.push({
            value: { dataSource, modelId: dataSources.find((item) => item.key === dataSource)?.value },
            key: entity,
            caption: schemas[dataSource][entity].caption
          })
        })
      })
      return entities
    }

    return []
  })

  readonly newCubes = signal<ISelectOption<{ modelId: string; dataSource: string }>[]>([])
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
    switchMap(() =>
      this.storyService.modelCubes$.pipe(
        map((models) => {
          const items: ISelectOption<{ dataSource: string; modelId: string }>[] = []
          models.forEach((model, index) => {
            items.push(
              ...model.cubes.map((cube) => ({
                value: {
                  dataSource: model.key,
                  modelId: model.value
                },
                key: cube.name,
                caption: cube.caption
              }))
            )
          })
          return items
        })
      )
    ),
    tap(() => this.loadingCubes$.next(false)),
    shareReplay(1),
    combineLatestWith(toObservable(this.entities)),
    map(([cubes, items]) =>
      cubes.filter(
        (cube) => !items.find((item) => item.value.dataSource === cube.value.dataSource && item.key === cube.key)
      )
    ),
    combineLatestWith(toObservable(this.entitySearch)),
    map(([cubes, text]) => filterSearch(cubes, text) as ISelectOption<{ dataSource: string; modelId: string }>[])
  )

  readonly property = signal<CalculationProperty>(null)

  constructor(
    private storyService: NxStoryService,
    private readonly _dialog: ZardDialogService,
    private readonly _viewContainerRef: ViewContainerRef
  ) {
    effect(
      () => {
        const entities = this.entities$()
        if (!this.activeLink() && entities?.length > 0) {
          this.activeEntity(entities[0].value.dataSource, entities[0].key)
        }
      }
    )
  }

  activeEntity(dataSource: string, entity: string) {
    this.activeLink.set({
      dataSource: dataSource,
      entity: entity,
      modelId: this.storyService.dataSources().find((item) => item.key === dataSource)?.value
    })
  }

  trackByKey(index: number, item) {
    return item?.key
  }

  addCube(cube: ISelectOption<{ dataSource: string; modelId: string }>) {
    this.newCubes.update((cubes) => [
      ...cubes,
      {
        value: cube.value,
        key: cube.key,
        caption: cube.caption
      }
    ])

    this.activeEntity(cube.value.dataSource, cube.key)
  }

  async openCreateParameter(name?: string) {
    const dataSettings = this.dataSettings()
    const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    this.#dialog
      .open(NgmParameterCreateComponent, {
        viewContainerRef: this._viewContainerRef,
        data: {
          dataSettings: dataSettings,
          entityType: entityType,
          name: name
        }
      })
      .closed.subscribe((result) => {
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

  openCreateCalculation() {
    this.router.navigate(['create'], { relativeTo: this.route })
  }

  openEditCalculation(calculationProperty: CalculationProperty) {
    const cubeName = this.dataSettings().entitySet
    this.router.navigate([encodeURIComponent(cubeName), calculationProperty.__id__], {
      relativeTo: this.route,
      state: { value: calculationProperty }
    })
  }

  removeCalculation(calculationProperty: CalculationProperty) {
    this.#confirmDelete
      .confirm({
        value: calculationProperty.caption || calculationProperty.name,
        information: ''
      })
      .subscribe((confirm) => {
        if (confirm) {
          this.storyService.removeCalculation({
            dataSettings: { dataSource: this.activeLink().dataSource, entitySet: this.activeLink().entity },
            name: calculationProperty.name
          })
        }
      })
  }

  close() {
    this.router.navigate(['../'], { relativeTo: this.route })
  }
}
