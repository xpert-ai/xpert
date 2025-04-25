import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, HostBinding, inject, OnInit, signal } from '@angular/core'
import { FormGroup } from '@angular/forms'
import { injectToastr } from '@cloud/app/@core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { DataSourceService, NgmSemanticModel, SemanticModelServerService } from '@metad/cloud/state'
import { FORMLY_ROW, FORMLY_W_1_2 } from '@metad/story/designer'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { cloneDeep, merge } from 'lodash-es'
import { map } from 'rxjs'
import { getErrorMessage, LANGUAGES, Visibility } from '../../../../@core/types'

@Component({
  selector: 'pac-model-preferences',
  templateUrl: './preferences.component.html',
  styleUrls: ['./preferences.component.scss']
})
export class ModelPreferencesComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly #i18n = inject(I18nService)
  readonly #modelService = inject(SemanticModelServerService)
  readonly #toastr = injectToastr()
  readonly #dialogRef = inject(DialogRef)

  public data: Partial<NgmSemanticModel> = inject(DIALOG_DATA)
  private readonly dataSourceService = inject(DataSourceService)

  private readonly dataSources$ = this.dataSourceService.getAll(['type']).pipe(
    map((dataSources) =>
      dataSources.map((item) => ({
        value: item.id,
        label: item.name
      }))
    )
  )

  form = new FormGroup({})
  model: Partial<NgmSemanticModel> = {}
  fields: FormlyFieldConfig[] = []

  get xmlaUrl() {
    return `https://api.mtda.cloud/api/semantic-model/${this.data?.id}/xmla`
  }

  readonly loading = signal(false)

  ngOnInit() {
    merge(this.model, cloneDeep(this.data))

    const TRANSLATE = this.#i18n.instant('PAC.MODEL.MODEL')

    const className = FORMLY_W_1_2
    this.fields = [
      {
        key: 'name',
        type: 'input',
        props: {
          label: TRANSLATE?.Name ?? 'Name',
          appearance: 'fill'
        }
      },
      {
        key: 'description',
        type: 'textarea',
        props: {
          label: TRANSLATE?.Description ?? 'Description',
          placeholder: TRANSLATE?.DescriptionPlaceholder ?? 'Description for semantic model',
          autosize: true,
          appearance: 'fill'
        }
      },
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'dataSourceId',
            type: 'select',
            props: {
              label: TRANSLATE?.DataSource ?? 'Data Source',
              readonly: true,
              appearance: 'fill',
              options: this.dataSources$
            }
          },
          {
            className,
            key: 'catalog',
            type: 'input',
            props: {
              label: TRANSLATE?.DataCatalog ?? 'Data Catalog',
              appearance: 'fill'
            }
          },
          {
            className,
            key: 'visibility',
            type: 'select',
            props: {
              label: TRANSLATE?.Visibility ?? 'Visibility',
              appearance: 'fill',
              options: [
                {
                  value: Visibility.Public,
                  label: TRANSLATE?.Visibility_Public ?? 'Public'
                },
                {
                  value: Visibility.Secret,
                  label: TRANSLATE?.Visibility_Secret ?? 'Secret'
                },
                {
                  value: Visibility.Private,
                  label: TRANSLATE?.Visibility_Private ?? 'Private'
                }
              ]
            }
          }
        ]
      },
      {
        key: 'preferences',
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className: FORMLY_W_1_2,
            key: 'enableCache',
            type: 'toggle',
            props: {
              label: TRANSLATE?.EnableServerCache ?? 'Enable Server Cache'
            }
          },
          {
            className: FORMLY_W_1_2,
            key: 'expires',
            type: 'input',
            expressionProperties: {
              'props.disabled': (model) => !model || !model.enableCache
            },
            props: {
              label: TRANSLATE?.CacheExpires ?? 'Cache Expires',
              placeholder: TRANSLATE?.CacheExpiresSecond ?? 'Cache Expires (Second)',
              type: 'number',
              appearance: 'fill'
            }
          },
          {
            className: FORMLY_W_1_2,
            key: 'language',
            type: 'select',
            props: {
              label: TRANSLATE?.Language ?? 'Language',
              placeholder: TRANSLATE?.LanguageContext ?? 'Language Context',
              appearance: 'fill',
              options: [{ value: null, label: TRANSLATE?.Auto ?? 'Auto' }, ...LANGUAGES]
            }
          },
          {
            className: FORMLY_W_1_2,
            key: 'exposeXmla',
            type: 'toggle',
            props: {
              label: TRANSLATE?.EnableExposeXMLA ?? 'Expose XMLA Service',
              placeholder: TRANSLATE?.EnableExposeXMLA ?? 'Expose XMLA Service'
            }
          }
        ]
      }
    ]
  }

  reset() {
    this.form.reset()
    this.form.patchValue(cloneDeep(this.data))
  }

  onFormChange(model) {
    // console.log(model)
  }

  saveModel() {
    this.loading.set(true)
    this.#modelService.updateModel(this.data.id, this.model).subscribe({
      next: () => {
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved Successfully' })
        this.#dialogRef.close(this.model)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
