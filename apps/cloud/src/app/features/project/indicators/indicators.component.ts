import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { RouterModule } from '@angular/router'
import { Indicator, IndicatorsService, convertIndicatorResult } from '@metad/cloud/state'
import { CommandDialogComponent } from '@metad/copilot-angular'
import { saveAsYaml, uploadYamlFile } from '@metad/core'
import { CdkConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective, NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { EMPTY, firstValueFrom, switchMap } from 'rxjs'
import { IIndicator, IndicatorType, ToastrService, getErrorMessage, isUUID, routeAnimations } from '../../../@core'
import { ManageEntityBaseComponent, MaterialModule } from '../../../@shared'
import { ProjectService } from '../project.service'
import { NewIndicatorCodePlaceholder, exportIndicator, injectFetchModelDetails } from '../types'
import { IndicatorImportComponent } from './indicator-import/indicator-import.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Dialog } from '@angular/cdk/dialog'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MaterialModule,

    ButtonGroupDirective,
    DensityDirective
  ],
  selector: 'pac-project-indicators',
  templateUrl: './indicators.component.html',
  styleUrls: ['./indicators.component.scss'],
  animations: [routeAnimations]
})
export class ProjectIndicatorsComponent extends ManageEntityBaseComponent<IIndicator> {
  NewIndicatorCodePlaceholder = NewIndicatorCodePlaceholder

  private projectService = inject(ProjectService)
  private _dialog = inject(MatDialog)
  readonly #dialog = inject(Dialog)
  readonly #logger = inject(NGXLogger)
  readonly #translate = inject(TranslateService)
  readonly indicatorsService = inject(IndicatorsService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly wasmAgent = inject(WasmAgentService)
  readonly toastrService = inject(ToastrService)
  readonly fetchModelDetails = injectFetchModelDetails()

  readonly selectedIndicators = signal<IIndicator[]>([])
  readonly hasDirty = this.projectService.hasDirty

  isDirty(id: string) {
    return this.projectService.dirty()[id]
  }

  async removeOpenedLink(link: IIndicator) {
    if (this.isDirty(link.id)) {
      const indicator = this.projectService.indicators().find((item) => item.id === link.id)
      const confirm = await firstValueFrom(
        this.#dialog.open(CdkConfirmDeleteComponent, {
            data: {
              title: this.getTranslation('PAC.ACTIONS.Close', { Default: 'Close' }) + ` [${indicator.name}]`,
              value: indicator.name,
              information: this.getTranslation('PAC.INDICATOR.IndicatorHasUnsavedChanges', {
                Default: `There are unsaved changes in the indicator.\n Are you sure to close it?`
              })
            }
          })
          .closed
      )
      if (!confirm) {
        return
      }
    }

    this.projectService.resetIndicator(link.id)
    super.removeOpenedLink(link)
  }

  async export() {
    const project = this.projectService.project()
    const indicators = this.selectedIndicators().length ? this.selectedIndicators() : project.indicators
    const indicatorsFileName = this.getTranslation('PAC.INDICATOR.Indicators', { Default: 'Indicators' })
    saveAsYaml(
      `${indicatorsFileName}.yaml`,
      indicators.map((item) => exportIndicator(convertIndicatorResult(item)))
    )
  }

  deleteSelected() {
    this.#dialog.open(CdkConfirmDeleteComponent, {
        data: {
          title: this.getTranslation('PAC.ACTIONS.Delete', { Default: 'Delete' }),
          information: this.getTranslation('PAC.INDICATOR.DeleteSelectedIndicators', {
            Default: 'Delete selected indicators?'
          })
        }
      })
      .closed
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            return this.projectService.deleteIndicators(this.selectedIndicators().map((item) => item.id))
          }
          return EMPTY
        })
      )
      .subscribe({
        next: () => {
          this.toastrService.success('PAC.INDICATOR.DeletedSelectedIndicators', {
            Default: 'Selected indicators deleted!'
          })
        },
        error: (error) => {
          this.toastrService.error(error)
        }
      })
  }

  async handleUploadChange(event) {
    const indicators = await uploadYamlFile<Indicator[]>(event.target.files[0])
    const project = this.projectService.project()
    const results = await firstValueFrom(
      this._dialog
        .open(IndicatorImportComponent, {
          data: {
            indicators,
            models: project.models,
            certifications: project.certifications,
            projectId: project?.id
          }
        })
        .afterClosed()
    )
    if (results) {
      // 下载上传结果
      saveAsYaml(
        `${this.getTranslation('PAC.INDICATOR.IndicatorImportResults', { Default: 'Indicator_Import_Results' })}.yml`,
        results
      )
      this.projectService.refreshIndicators()

      this.router.navigate(['.'], { relativeTo: this.route })
    }
  }

  replaceNewIndicator(id: string, indicator: Indicator) {
    const index = this.openedLinks().findIndex((item) => item.id === id)
    if (index > -1) {
      this.openedLinks().splice(index, 1, indicator)
    }
    this.currentLink.set(indicator)
  }

  async saveAll() {
    for await (const id of Object.keys(this.projectService.dirty())) {
      let indicator = this.projectService.indicators().find((item) => item.id === id)
      if (indicator) {
        try {
          await this.saveIndicator(indicator)
        } catch (error) {
          this.toastrService.error(getErrorMessage(error))
        }
      }
    }
  }

  async saveIndicator(indicator: Indicator) {
    let _indicator = {
      ...indicator,
      measure: indicator.type === IndicatorType.BASIC ? indicator.measure : null,
      formula: indicator.type === IndicatorType.DERIVE ? indicator.formula : null,
      projectId: this.projectService.project().id ?? null
    }
    if (!isUUID(_indicator.id)) {
      delete _indicator.id
    }

    _indicator = await firstValueFrom(this.indicatorsService.create(_indicator))

    this.projectService.replaceNewIndicator(indicator.id, _indicator)
    if (isUUID(indicator.id)) {
      this.toastrService.success('PAC.INDICATOR.REGISTER.SaveIndicator', { Default: 'Save Indicator' })
    } else {
      this.toastrService.success('PAC.INDICATOR.REGISTER.CreateIndicator', { Default: 'Create Indicator' })
      this.replaceNewIndicator(indicator.id, _indicator)
    }
    return _indicator
  }

  register() {
    this.projectService.newIndicator()

    this.router.navigate([NewIndicatorCodePlaceholder], {
      relativeTo: this.route
    })
  }

  aiRegister() {
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        disableClose: true,
        data: {
          commands: ['indicator']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }
}
