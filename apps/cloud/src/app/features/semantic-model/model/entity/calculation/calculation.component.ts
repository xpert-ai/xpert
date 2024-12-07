import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnDestroy, ViewChild, computed, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { BaseEditorDirective } from '@metad/components/editor'
import { CommandDialogComponent } from '@metad/copilot-angular'
import { DisplayDensity } from '@metad/ocap-angular/core'
import { NgmCalculatedMeasureComponent, NgmFormulaEditorComponent } from '@metad/ocap-angular/entity'
import { NgmFormulaModule } from '@metad/ocap-angular/formula'
import { Syntax, stringifyProperty } from '@metad/ocap-core'
import { getSemanticModelKey } from '@metad/story/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { isNil, negate } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { EMPTY } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { Store, ToastrService } from '../../../../../@core'
import { AppService } from '../../../../../app.service'
import { injectFormulaCommand } from '../../copilot/'
import { SemanticModelService } from '../../model.service'
import { MODEL_TYPE, ModelDesignerType } from '../../types'
import { ModelEntityService } from '../entity.service'
import { getDropProperty } from '../types'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

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
    MaterialModule,
    TranslateModule,
    ContentLoaderModule,
    NgmFormulaModule,
    NgmFormulaEditorComponent,

    NgmCalculatedMeasureComponent
  ]
})
export class ModelEntityCalculationComponent extends TranslationBaseComponent implements OnDestroy {
  DisplayDensity = DisplayDensity
  Syntax = Syntax
  ModelType = MODEL_TYPE

  public readonly appService = inject(AppService)
  public readonly modelService = inject(SemanticModelService)
  public readonly entityService = inject(ModelEntityService)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #logger = inject(NGXLogger)
  readonly #store = inject(Store)
  readonly #toastr = inject(ToastrService)
  readonly #dialog = inject(MatDialog)

  @ViewChild('editor') editor!: BaseEditorDirective

  readonly params = injectParams()
  readonly key = computed(() => this.params()?.id)

  public readonly options$ = this.modelService.wordWrap$.pipe(map((wordWrap) => ({ wordWrap })))

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

  readonly formula = computed(() => this.calculatedMember()?.formula)
  readonly entityType = this.entityService.entityType
  readonly syntax = computed(() => this.entityType().syntax)

  private readonly modelKey = toSignal(this.modelService.model$.pipe(map(getSemanticModelKey)))
  private readonly cubeName = toSignal(
    this.entityService.cube$.pipe(
      map((cube) => cube?.name),
      filter(negate(isNil))
    )
  )

  public readonly dataSettings = computed(() => ({
    dataSource: this.modelKey(),
    entitySet: this.cubeName()
  }))

  readonly modelType = toSignal(this.modelService.modelType$)
  readonly dialect = this.modelService.dialect
  readonly selectedProperty = this.entityService.selectedProperty
  readonly typeKey = computed(() => `${ModelDesignerType.calculatedMember}#${this.key()}`)

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #formulaCommand = injectFormulaCommand(this.calculatedMember)

  /**
  |--------------------------------------------------------------------------
  | Subscribers
  |--------------------------------------------------------------------------
  */

  constructor() {
    super()

    effect(
      () => {
        if (this.calculatedMember()) {
          this.entityService.setSelectedProperty(this.typeKey())
        }
      },
      { allowSignalWrites: true }
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

  dropFormula(event: CdkDragDrop<any[]>) {
    const previousItem = event.item.data
    const index = event.currentIndex
    if (event.previousContainer.id === 'list-dimensions') {
      const item = getDropProperty(event, this.modelType(), this.dialect())
      this.setFormula(`${this.formula()}${stringifyProperty(item)}`)
    }
  }

  onEditorKeyDown(event) {
    console.log(event)
  }

  aiFormula() {
    this.#dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        data: {
          commands: ['formula']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }

  ngOnDestroy(): void {
    if (this.selectedProperty() === this.typeKey()) {
      this.entityService.setSelectedProperty(null)
    }
  }
}
