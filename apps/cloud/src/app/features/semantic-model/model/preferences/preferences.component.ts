import { Component, HostBinding, OnInit, inject } from '@angular/core'
import { FormGroup } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { DataSourceService, NgmSemanticModel } from '@metad/cloud/state'
import { FORMLY_ROW, FORMLY_W_1_2 } from '@metad/story/designer'
import { cloneDeep, merge } from 'lodash-es'
import { firstValueFrom, map } from 'rxjs'
import { LANGUAGES, Visibility } from '../../../../@core/types'
import { TranslationBaseComponent } from '../../../../@shared/language'

@Component({
  selector: 'pac-model-preferences',
  templateUrl: './preferences.component.html',
  styleUrls: ['./preferences.component.scss']
})
export class ModelPreferencesComponent extends TranslationBaseComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  public data: Partial<NgmSemanticModel> = inject(MAT_DIALOG_DATA)
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

  async ngOnInit() {
    merge(this.model, cloneDeep(this.data))

    const TRANSLATE = await firstValueFrom(this.translateService.get('PAC.MODEL.MODEL'))

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
              placeholder: TRANSLATE?.EnableExposeXMLA ?? 'Expose XMLA Service',
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
}
