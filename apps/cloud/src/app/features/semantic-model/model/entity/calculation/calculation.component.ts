import { CdkDrag, CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ViewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { convertQueryResultColumns, linkedModel } from '@xpert-ai/core'
import { NgmSpinComponent, NgmTableComponent } from '@xpert-ai/ocap-angular/common'
import { DisplayDensity } from '@xpert-ai/ocap-angular/core'
import {
  NgmCalculatedMeasureComponent,
  NgmEntityModule,
  NgmFormulaEditorComponent,
  PropertyCapacity
} from '@xpert-ai/ocap-angular/entity'
import { NgmBaseEditorDirective, NgmFormulaModule } from '@xpert-ai/ocap-angular/formula'
import { Dimension, measureFormatter, nonBlank, QueryReturn, stringifyProperty, Syntax } from '@xpert-ai/ocap-core'
import { Crossjoin, Members } from '@xpert-ai/ocap-xmla'
import { getSemanticModelKey } from '@xpert-ai/story/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { differenceBy, isNil, isPlainObject } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { EMPTY, of } from 'rxjs'
import { catchError, map, startWith } from 'rxjs/operators'
import { getErrorMessage, ToastrService } from '../../../../../@core'
import { AppService } from '../../../../../app.service'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE, ModelDesignerType } from '../../types'
import { ModelEntityService } from '../entity.service'
import { getDropProperty } from '../types'
import { animate, style, transition, trigger } from '@angular/animations'
import { typeOfObj } from '@cloud/app/@shared/model/types'
import { ZardDialogService, ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-entity-calculation',
  templateUrl: './calculation.component.html',
  styleUrls: ['./calculation.component.scss'],
  host: {
    class: 'pac-model-entity-calculation'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    ...ZardTooltipImports,
    ContentLoaderModule,
    NgmTableComponent,
    NgmEntityModule,
    NgmFormulaModule,
    NgmFormulaEditorComponent,
    NgmSpinComponent,

    NgmCalculatedMeasureComponent
  ],
  animations: [
    trigger('rotateTrigger', [
      transition(':enter', [
        style({ transform: 'rotate(90deg)', opacity: 0 }),
        animate('100ms ease-out', style({ transform: 'rotate(0deg)', opacity: 1 }))
      ])
    ])
  ]
})
export class ModelEntityCalculationComponent {
  DisplayDensity = DisplayDensity
  Syntax = Syntax
  ModelType = MODEL_TYPE
  propertyCapacities = [PropertyCapacity.Dimension]

  readonly appService = inject(AppService)
  readonly modelService = inject(SemanticModelService)
  readonly entityService = inject(ModelEntityService)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #logger = inject(NGXLogger)
  readonly #toastr = inject(ToastrService)
  readonly #dialog = inject(ZardDialogService)

  @ViewChild('editor') editor!: NgmBaseEditorDirective

  // Inputs
  readonly key = input<string>()

  // Outputs
  readonly close = output<void>()

  readonly options$ = this.modelService.wordWrap$.pipe(map((wordWrap) => ({ wordWrap })))

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly cube = this.entityService.cube
  readonly isMobile = toSignal(this.appService.isMobile$)

  readonly calculatedMember = derivedAsync(() => {
    if (this.key()) {
      return this.entityService.selectCalculatedMember(this.key())
    }
    return EMPTY
  })

  readonly formula = linkedModel({
    initialValue: null,
    compute: () => this.calculatedMember()?.formula,
    update: () => {}
  })
  readonly formulaName = linkedModel({
    initialValue: null,
    compute: () => this.calculatedMember()?.name,
    update: () => {}
  })

  readonly isDirty = computed(() => this.formula() !== this.calculatedMember()?.formula)

  readonly entityType = this.entityService.entityType
  readonly syntax = computed(() => this.entityType().syntax)

  private readonly modelKey = toSignal(this.modelService.model$.pipe(map(getSemanticModelKey)))
  private readonly cubeName = computed(() => this.cube()?.name)

  readonly dataSettings = computed(() => ({
    dataSource: this.modelKey(),
    entitySet: this.cubeName()
  }))

  readonly modelType = this.modelService.modelType
  readonly dialect = this.modelService.dialect
  readonly selectedProperty = this.entityService.selectedProperty
  readonly typeKey = computed(() => `${ModelDesignerType.calculatedMember}#${this.key()}`)

  // Test
  readonly showTest = signal(false)
  readonly testDimensions = signal<Dimension[]>([])

  readonly testStatement = computed(() => {
    const dimensions = this.testDimensions().map(stringifyProperty).filter(nonBlank)
    const cubeName = this.cubeName()
    const formulaName = this.formulaName() || '_'
    let statement = `WITH MEMBER ${measureFormatter(formulaName)} AS ${this.formula()}\nSELECT\n  NON EMPTY {${measureFormatter(formulaName)}} ON COLUMNS`
    if (dimensions.length) {
      statement += `,\n  `
      if (this.testDimensions().some((_) => _.zeroSuppression)) {
        statement += `NON EMPTY `
      }
      statement += `${Crossjoin(...dimensions.map((dim) => Members(dim)))} ON ROWS`
    }
    statement += `\nFROM [${cubeName}]`
    return statement
  })

  readonly testResult = derivedAsync<{ loading?: boolean; error?: string; data?: any[]; columns?: any[] }>(() => {
    return this.testStatement() && this.showTest()
      ? this.modelService.dataSource$.value.query({ statement: this.testStatement(), forceRefresh: true }).pipe(
          catchError((error) => {
            return of({
              error: getErrorMessage(error)
            })
          }),
          map(({ status, error, schema, data }: QueryReturn<unknown>) => {
            if (error) {
              return {
                error
              }
            }

            const columns = convertQueryResultColumns(schema)

            if (isPlainObject(data)) {
              columns.push(...typeOfObj(data))
              data = [data]
            }
            return {
              data,
              columns
            }
          }),
          startWith({ loading: true })
        )
      : of(null)
  })

  constructor() {
    effect(
      () => {
        if (this.calculatedMember()) {
          this.entityService.setSelectedProperty(this.typeKey())
        }
      }
    )

    effect(() => {
      if (!this.calculatedMember()) {
        this.#router.navigate(['../404'], { relativeTo: this.#route })
      }
    })
  }

  /**
  |--------------------------------------------------------------------------
  | Methods
  |--------------------------------------------------------------------------
  */
  trackByIndex(index: number, el: any): number {
    return index
  }

  setFormula(formula: string) {
    const calculatedMember = this.calculatedMember()
    if (this.modelType() === MODEL_TYPE.OLAP) {
      if (isNil(calculatedMember)) {
        // this.#toastr.error(`请先选择一个计算成员`)
        return
      }
    }
    // null and "" as the same
    if (!isNil(calculatedMember) && (!formula !== !calculatedMember?.formula || !!formula)) {
      this.entityService.setCalculatedMember({
        ...calculatedMember,
        formula
      })
    } else {
      // this.entityService.setEntityExpression(formula)
    }
  }

  dropEntity(event) {
    this.editor.insert(event.item.data?.name)
  }

  onEditorKeyDown(event) {
    console.log(event)
  }

  toggleTest() {
    this.showTest.update((state) => !state)
  }

  dropRowsPredicate(item: CdkDrag<any>) {
    return (
      // dimensions
      item.dropContainer.id === CdkDragDropContainers.Dimensions
    )
  }

  dropTestDimensions(event: CdkDragDrop<unknown[]>) {
    if (event.previousContainer === event.container) {
      this.testDimensions.update((state) => {
        const rows = [...state]
        moveItemInArray(rows, event.previousIndex, event.currentIndex)
        return rows
      })
    } else {
      if (event.previousContainer.id === CdkDragDropContainers.Dimensions) {
        const item = getDropProperty(event, this.modelType(), this.dialect())
        if (event.container.id === 'formula-test-rows') {
          const rows = differenceBy(this.testDimensions(), [item], 'dimension')
          rows.splice(event.currentIndex, 0, item)
          this.testDimensions.set(rows)
        }
      }
    }
  }

  onTestRowChange(event: Dimension, i: number) {
    this.testDimensions.update((state) => {
      const rows = [...state]
      rows[i] = event
      return rows
    })
  }

  removeTestRow(index: number) {
    this.testDimensions.update((state) => {
      const rows = [...state]
      rows.splice(index, 1)
      return rows
    })
  }

  addTestDimension() {
    this.testDimensions.update((state) => [...state, {}])
  }

  cancel() {
    this.close.emit()
  }

  apply() {
    this.setFormula(this.formula())
  }
}
