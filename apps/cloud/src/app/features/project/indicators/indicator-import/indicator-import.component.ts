import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { ISemanticModel } from '@metad/contracts'
import { AppearanceDirective, ButtonGroupDirective, ISelectOption, NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { Indicator, assign, isNil, isString, omitBy } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { IndicatorsService, SemanticModelServerService, NgmSemanticModel } from '@metad/cloud/state'
import { ToastrService, getErrorMessage, registerModel } from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { combineLatest, firstValueFrom } from 'rxjs'
import { IndicatorRegisterFormComponent } from '../register-form/register-form.component'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    TranslateModule,
    AppearanceDirective,
    ButtonGroupDirective,
    IndicatorRegisterFormComponent
  ],
  selector: 'pac-indicator-import',
  templateUrl: 'indicator-import.component.html',
  styleUrls: ['indicator-import.component.scss']
})
export class IndicatorImportComponent {
  private readonly data = inject(MAT_DIALOG_DATA)
  private readonly modelsService = inject(SemanticModelServerService)
  private readonly dsCoreService = inject(NgmDSCoreService)
  private readonly wasmAgent = inject(WasmAgentService)
  private readonly indicatorsService = inject(IndicatorsService)
  private readonly toastrService = inject(ToastrService)
  private readonly _dialogRef = inject(MatDialogRef<IndicatorImportComponent>)

  get indicators() {
    return this.data?.indicators
  }
  get models() {
    return this.data?.models
  }

  activedLink = ''
  indicator = []
  certifications: ISelectOption[] = []
  uploading = false

  private modelsSub = combineLatest<ISemanticModel[]>(
    this.models.map((model) => this.modelsService.getById(model.id, ['dataSource', 'dataSource.type', 'indicators']))
  ).pipe(takeUntilDestroyed()).subscribe((models) => {
    models.forEach((storyModel) => registerModel(storyModel as NgmSemanticModel, this.dsCoreService, this.wasmAgent))
  })
  constructor() {
    this.certifications =
      this.data.certifications?.map((certification) => ({
        value: certification.id,
        label: certification.name
      })) ?? []

    this.activeLink(this.indicators[0])
  }

  removeIndicator(index: number) {
    this.indicators.splice(index, 1)
  }

  activeLink(indicator: Indicator) {
    this.activedLink = indicator.code
    this.indicator = [indicator]
  }

  onIndicatorChange(indicator: Indicator) {
    assign(this.indicator[0], indicator)
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
                filters: isString(item.filters) && item.filters!! ? JSON.parse(item.filters) : item.filters,
                dimensions:
                  isString(item.dimensions) && item.dimensions ? JSON.parse(item.dimensions) : item.dimensions,
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
