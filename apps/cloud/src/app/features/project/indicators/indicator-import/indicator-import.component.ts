import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { XpIndicatorRegisterFormComponent } from '@cloud/app/@shared/indicator'
import {
  IIndicator,
  ISemanticModel,
  IndicatorsService,
  NgmSemanticModel,
  SemanticModelServerService
} from '@metad/cloud/state'
import { AppearanceDirective, ButtonGroupDirective, ISelectOption, NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { Indicator, assign, isNil, omitBy } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, getErrorMessage, registerModel } from 'apps/cloud/src/app/@core'
import { combineLatest, firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatListModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    TranslateModule,
    AppearanceDirective,
    ButtonGroupDirective,
    XpIndicatorRegisterFormComponent
  ],
  selector: 'pac-indicator-import',
  templateUrl: 'indicator-import.component.html',
  styleUrls: ['indicator-import.component.scss']
})
export class IndicatorImportComponent {
  private readonly data = inject(DIALOG_DATA)
  private readonly modelsService = inject(SemanticModelServerService)
  private readonly dsCoreService = inject(NgmDSCoreService)
  private readonly wasmAgent = inject(WasmAgentService)
  private readonly indicatorsService = inject(IndicatorsService)
  private readonly toastrService = inject(ToastrService)
  private readonly _dialogRef = inject(DialogRef<IIndicator[]>)

  get indicators() {
    return this.data?.indicators
  }
  get models() {
    return this.data?.models
  }

  // activedLink = ''
  readonly activedIndex = signal(0)
  readonly _indicator = computed(() => {
    const indicator = this.indicators?.[this.activedIndex()]
    return indicator ? [indicator] : []
  })
  // indicator = []
  certifications: ISelectOption[] = []
  uploading = false

  private modelsSub = combineLatest<ISemanticModel[]>(
    this.models.map((model) =>
      this.modelsService.getById(model.id, { relations: ['dataSource', 'dataSource.type', 'indicators'] })
    )
  )
    .pipe(takeUntilDestroyed())
    .subscribe((models) => {
      models.forEach((storyModel) =>
        registerModel(storyModel as NgmSemanticModel, false, this.dsCoreService, this.wasmAgent)
      )
    })
  constructor() {
    this.certifications =
      this.data.certifications?.map((certification) => ({
        value: certification.id,
        label: certification.name
      })) ?? []

    this.activeLink(0, this.indicators[0])
  }

  removeIndicator(index: number) {
    this.indicators.splice(index, 1)
  }

  activeLink(index: number, indicator: Indicator) {
    this.activedIndex.set(index)
    // this.indicator = [indicator]
  }

  onIndicatorChange(indicator: Indicator) {
    assign(this.indicators[this.activedIndex()], indicator)
  }

  async bulkCreate() {
    this.uploading = true

    try {
      const results = await firstValueFrom(
        this.indicatorsService.createBulk(
          this.indicators.map((item: any) =>
            omitBy(
              {
                ...item,
                // 向后兼容
                // filters: isString(item.filters) && item.filters!! ? JSON.parse(item.filters) : item.filters,
                // dimensions:
                //   isString(item.dimensions) && item.dimensions ? JSON.parse(item.dimensions) : item.dimensions,
                projectId: this.data.projectId || null
              },
              isNil
            )
          )
        )
      )

      this.toastrService.success('PAC.INDICATOR.REGISTER.IndicatorsBulkCreate', {
        Default: 'Indicators Bulk Create'
      })

      this._dialogRef.close(results)
    } catch (err) {
      this.toastrService.error(getErrorMessage(err), '')
    } finally {
      this.uploading = false
    }
  }
}
