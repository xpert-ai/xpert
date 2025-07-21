import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatSlideToggleChange } from '@angular/material/slide-toggle'
import { MatSnackBar } from '@angular/material/snack-bar'
import { ActivatedRoute } from '@angular/router'
import { calcEntityTypePrompt, nonBlank } from '@metad/core'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { injectCopilotCommand } from '@metad/copilot-angular'
import { NgmDSCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import { EntityCapacity, NgmCalculatedMeasureComponent, NgmEntitySchemaComponent } from '@metad/ocap-angular/entity'
import { AggregationRole, C_MEASURES, CalculatedMember, CubeUsage, Syntax, VirtualCube, VirtualCubeDimension } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { NgmNotificationComponent } from 'apps/cloud/src/app/@theme'
import { NGXLogger } from 'ngx-logger'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { SemanticModelService } from '../model.service'
import { CdkDragDropContainers, SemanticModelEntityType } from '../types'
import { VirtualCubeStateService } from './virtual-cube.service'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'


@Component({
  standalone: true,
  selector: 'pac-model-virtual-cube',
  templateUrl: 'virtual-cube.component.html',
  styleUrls: ['virtual-cube.component.scss'],
  providers: [VirtualCubeStateService],
  imports: [
    CommonModule,
    SharedModule,
    MaterialModule,

    OcapCoreModule,
    NgmEntitySchemaComponent,
    ResizerModule,
    NgmCommonModule,
    NgmCalculatedMeasureComponent
  ]
})
export class VirtualCubeComponent {
  Syntax = Syntax
  EntityCapacity = EntityCapacity

  private _dialog = inject(MatDialog)
  private dsCoreService = inject(NgmDSCoreService)
  private modelState = inject(SemanticModelService)
  private virtualCubeState = inject(VirtualCubeStateService)
  private route = inject(ActivatedRoute)
  readonly #snackBar = inject(MatSnackBar)
  readonly #translate = inject(TranslateService)
  readonly #logger = inject(NGXLogger)

  public readonly cubeKey$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter(nonBlank),
    distinctUntilChanged()
  )

  public readonly cubes$ = this.virtualCubeState.cubes$
  public readonly measures$ = this.virtualCubeState.measures$
  public readonly calculatedMembers$ = this.virtualCubeState.calculatedMembers$

  selectedCube: string
  readonly virtualCube = signal<VirtualCube>(null)
  calcMemberFormGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    caption: new FormControl(),
    dimension: new FormControl(C_MEASURES, [Validators.required]),
    formula: new FormControl('', [Validators.required]),
    unit: new FormControl()
  })

  get name() {
    return this.calcMemberFormGroup.get('name').value
  }
  get formula() {
    return this.calcMemberFormGroup.get('formula') as FormControl
  }
  public _formula = ''

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly dataSource$ = toSignal(this.modelState.semanticModelKey$)
  readonly virtualCube$ = this.virtualCubeState.virtualCube
  readonly dimensions$ = toSignal(this.virtualCubeState.dimensions$)
  readonly virtualCubeName$ = computed(() => this.virtualCube$().name)
  readonly dataSettings$ = computed(() => ({
    dataSource: this.dataSource$(),
    entitySet: this.virtualCubeName$()
  }))
  readonly entityType = toSignal(
    toObservable(this.dataSettings$).pipe(
      switchMap(({ dataSource, entitySet }) => this.dsCoreService.selectEntitySet(dataSource, entitySet)),
      map((entitySet) => entitySet?.entityType)
    ),
    { initialValue: null }
  )

  readonly showCalculatedMember = signal(false)
  readonly showFormula = signal(false)

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private cubeKeySub = this.cubeKey$.pipe(takeUntilDestroyed()).subscribe((key) => {
    this.virtualCubeState.init(key)
  })

  /**
  |--------------------------------------------------------------------------
  | Copilot Commands
  |--------------------------------------------------------------------------
  */
  #formula = injectCopilotCommand({
    name: 'formula',
    description: this.#translate.instant('PAC.MODEL.Copilot.CreateCalculatedFormula', {
      Default: 'Create a formula for the measure'
    }),
    systemPrompt: async () => {
      let prompt = `你是一名 BI 多维数据建模专家，你现在需要根据用户需求用 Multidimensional Expressions (MDX) 创建计算公式度量。
如果计算度量结果为比率类型，请将 unit 设置为 % 。 如果有当前计算度量请修改公式，如果未提供则新建。`
      if (this.showCalculatedMember()) {
        prompt += `\n当前计算度量为:
\`\`\`
${Object.entries(this.calcMemberFormGroup.value)
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')}
\`\`\`
`
      }

      if (this.entityType()) {
        prompt += `\n当前选择的 Cube 信息为:
\`\`\`
${calcEntityTypePrompt(this.entityType())}
\`\`\`
`
      }
      return prompt
    },
    actions: [
      // injectMakeCopilotActionable({
      //   name: 'new_or_edit_calculated_member',
      //   description: 'Create a new formula for the calculated measure',
      //   argumentAnnotations: [
      //     {
      //       name: 'formula',
      //       type: 'string',
      //       description: 'provide the new formula',
      //       required: true
      //     },
      //     {
      //       name: 'unit',
      //       type: 'string',
      //       description: 'unit of the formula',
      //       required: true
      //     }
      //   ],
      //   implementation: async (formula: string, unit: string) => {
      //     this.#logger.debug(`Copilot command 'formula' params: formula is`, formula, `unit is`, unit)
      //     this.calcMemberFormGroup.patchValue({ formula, unit })
      //     this.showCalculatedMember.set(true)

      //     return `✅`
      //   }
      // })
    ]
  })

  constructor() {
    effect(() => {
      console.log(`[VirtualCubeComponent] dataSettings`, this.dataSettings$())
    })
  }

  trackByName(index: number, item: CubeUsage) {
    return item.cubeName
  }

  editVirtualCube(cube: VirtualCube) {
    this.virtualCube.set({ ...cube })
  }

  applyVirtualCube() {
    this.virtualCubeState.patchState({
      ...this.virtualCube()
    })
    this.virtualCube.set(null)
  }

  cancelVirtualCube() {
    this.virtualCube.set(null)
  }

  cubePredicate(item: CdkDrag<any>) {
    return item.data?.type === SemanticModelEntityType.CUBE
  }

  dropCube(event: CdkDragDrop<{ name: string }[]>) {
    if (event.container === event.previousContainer) {
      this.virtualCubeState.moveItemInCubes(event)
    } else if (event.previousContainer.id === CdkDragDropContainers.Cubes) {
      if (event.item.data.type === SemanticModelEntityType.CUBE) {
        this.virtualCubeState.addCube({ index: event.currentIndex, cubeName: event.item.data.name })
      }
    }
  }

  cubeRemovePredicate(item: CdkDrag<any>) {
    return item.data?.type === 'Entity'
  }

  selectCube(cube) {}

  changeIgnoreUnrelatedDimensions(event: MatSlideToggleChange, cube: CubeUsage) {
    this.virtualCubeState.updateCube({
      cubeName: cube.cubeName,
      ignoreUnrelatedDimensions: event.checked
    })
  }

  removeCube(name: string) {
    this.virtualCubeState.removeCube(name)
  }

  dropDimensionPredicate(item: CdkDrag<any>) {
    return item.data?.role === AggregationRole.dimension
  }

  dropDimension(event: CdkDragDrop<VirtualCubeDimension[]>) {
    if (event.container === event.previousContainer) {
      this.virtualCubeState.moveItemInDimensions(event)
    } else if (event.item.data.role === AggregationRole.dimension) {
      this.virtualCubeState.addDimension({ index: event.currentIndex, dimension: event.item.data })
    }
  }

  changeDimensionShared(event: MatSlideToggleChange, name: string) {
    this.virtualCubeState.updateDimension({
      name,
      __shared__: event.checked
    })
  }

  removeDimension(name: string) {
    this.virtualCubeState.removeDimension(name)
  }

  dropMeasurePredicate(item: CdkDrag<any>) {
    return item.data?.role === AggregationRole.measure
  }

  dropMeasure(event: CdkDragDrop<{ name: string }[]>) {
    if (event.container === event.previousContainer) {
      this.virtualCubeState.moveItemInMeasures(event)
    } else if (event.item.data.role === AggregationRole.measure) {
      this.virtualCubeState.addMeasure({ index: event.currentIndex, measure: event.item.data })
    }
  }

  removeMeasure(name: string) {
    this.virtualCubeState.removeMeasure(name)
  }

  createCalculatedMember() {
    this.showCalculatedMember.set(true)
    this.calcMemberFormGroup.reset({ dimension: C_MEASURES })
  }

  editCalculatedMember(member: CalculatedMember) {
    this.showCalculatedMember.set(true)
    this.calcMemberFormGroup.setValue(member as any)
  }

  applyCalculatedMember() {
    this.virtualCubeState.applyCalculatedMember(this.calcMemberFormGroup.value as CalculatedMember)
    this.showCalculatedMember.set(null)
  }

  removeCalculatedMember(name: string) {
    this.virtualCubeState.removeCalculatedMember(name)
  }

  cancelCalculatedMember() {
    this.showCalculatedMember.set(null)
  }

  toggleFormula() {
    this.showFormula.update((state) => !state)
  }

  // openFormula() {
  //   const dataSettings = this.dataSettings$()
  //   const entityType = this.entityType()

  //   if (entityType?.name !== this.virtualCube$().name) {
  //     return this.openNeedSaveMessage()
  //   }

  //   this._dialog
  //     .open(ModelFormulaComponent, {
  //       panelClass: 'large',
  //       data: {
  //         dataSettings,
  //         entityType,
  //         formula: this.formula.value
  //       }
  //     })
  //     .afterClosed()
  //     .subscribe((_formula) => {
  //       if (_formula) {
  //         this.formula.setValue(_formula)
  //       }
  //     })
  // }

  onApplyFormula() {
    this.formula.setValue(this._formula)
  }

  openNeedSaveMessage() {
    this.#snackBar.openFromComponent(NgmNotificationComponent, {
      data: {
        color: 'primary',
        message: this.#translate.instant('PAC.MODEL.VirtualCube.PleaseSave', { Default: 'Please Save' }),
        description: this.#translate.instant('PAC.MODEL.VirtualCube.PleaseSaveTheCorrectVirtualCube', {
          Default: 'Please save the correct virtual cube configuration before editing the formula.'
        })
      },
      duration: 5 * 1000,
      horizontalPosition: 'end',
      verticalPosition: 'bottom'
    })
  }
}
