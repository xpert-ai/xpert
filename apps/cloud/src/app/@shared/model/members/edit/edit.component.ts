import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { getErrorMessage } from '@cloud/app/@core'
import { convertQueryResultColumns } from '@metad/core'
import { NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { NgmCalculatedMeasureComponent, NgmEntityModule, PropertyCapacity } from '@metad/ocap-angular/entity'
import {
  CalculatedMember,
  Dimension,
  isEntitySet,
  measureFormatter,
  nonBlank,
  QueryReturn,
  stringifyProperty,
  Syntax
} from '@metad/ocap-core'
import { Crossjoin, Members } from '@metad/ocap-xmla'
import { TranslateModule } from '@ngx-translate/core'
import { isPlainObject } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, map, of, startWith } from 'rxjs'
import { ModelStudioService } from '../../studio/studio.service'
import { typeOfObj } from '../../types'
import { animate, style, transition, trigger } from '@angular/animations'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-model-member-edit',
  templateUrl: 'edit.component.html',
  styleUrls: ['edit.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatTooltipModule,
    NgmTableComponent,
    TranslateModule,
    NgmEntityModule,
    NgmSpinComponent,
    NgmCalculatedMeasureComponent
  ],
  host: {
    class: 'xp-model-member-edit'
  },
  animations: [
    trigger('rotateTrigger', [
      transition(':enter', [
        style({ transform: 'rotate(90deg)', opacity: 0 }),
        animate('100ms ease-out', style({ transform: 'rotate(0deg)', opacity: 1 }))
      ]),
    ])
  ]
})
export class ModelMemberEditComponent {
  eSyntax = Syntax
  propertyCapacities = [PropertyCapacity.Dimension]

  readonly dsCoreService = inject(NgmDSCoreService)
  readonly studioService = inject(ModelStudioService)

  // Inputs
  readonly member = model<CalculatedMember>()
  readonly modelKey = input<string>()
  readonly cubeName = input<string>()

  // Outputs
  readonly close = output<void>()

  // States
  readonly formula = linkedModel({
    initialValue: null,
    compute: () => this.member()?.formula,
    update: () => {}
  })
  readonly formulaName = linkedModel({
    initialValue: null,
    compute: () => this.member()?.name,
    update: () => {}
  })

  readonly isDirty = computed(() => this.formula() !== this.member()?.formula)

  readonly dataSettings = computed(() => ({
    dataSource: this.modelKey(),
    entitySet: this.cubeName()
  }))

  readonly #entitySet = derivedAsync(() => this.dsCoreService.selectEntitySet(this.modelKey(), this.cubeName()))
  readonly entityType = computed(() => (isEntitySet(this.#entitySet()) ? this.#entitySet().entityType : undefined))
  readonly error = computed(() => (isEntitySet(this.#entitySet()) ? undefined : this.#entitySet()))

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
      ? this.studioService.dataSource$.value.query({ statement: this.testStatement(), forceRefresh: true }).pipe(
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
    effect(() => {}, { allowSignalWrites: true })
  }

  toggleTest() {
    this.showTest.update((state) => !state)
  }

  dropTestDimensions(event: CdkDragDrop<unknown[]>) {
    if (event.previousContainer === event.container) {
      this.testDimensions.update((state) => {
        const rows = [...state]
        moveItemInArray(rows, event.previousIndex, event.currentIndex)
        return rows
      })
    } else {
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

  setFormula(formula: string) {
    this.member.update((member) => {
      return {...member, formula }
    })
    this.close.emit()
  }

  cancel() {
    this.close.emit()
  }

  apply() {
    this.setFormula(this.formula())
  }
}
