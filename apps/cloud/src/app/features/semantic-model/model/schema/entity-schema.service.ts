import { inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { DataSettingsSchemaService } from '@metad/story/designer'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { filter, map, shareReplay, switchMap } from 'rxjs/operators'
import { injectHelpWebsite } from '@cloud/app/@core'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { ModelEntityService } from '../entity/entity.service'
import { SemanticModelService } from '../model.service'
import { EntitySchemaState } from './types'

@Injectable()
export class EntitySchemaService<T extends EntitySchemaState<T['modeling']>> extends DataSettingsSchemaService<T> {
  protected readonly modelService = inject(SemanticModelService)
  protected readonly entityService? = inject(ModelEntityService, { optional: true })
  readonly helpWebsite = injectHelpWebsite()
  readonly i18n = injectI18nService()

  public readonly id$ = this.select((state) => state.id)
  public readonly modeling$ = this.select((state) => state.modeling)

  public readonly tables$ = this.modelService.selectDBTables().pipe(
    map((dbTables) => {
      const tables = dbTables
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((table) => ({
          value: table.name,
          key: table.name,
          caption: table.caption
        }))
      tables.splice(0, 0, {
        value: null,
        key: null,
        caption: this.getTranslation('PAC.MODEL.SCHEMA.COMMON.None', { Default: 'None' }) ?? 'None'
      })
      return tables
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly entityType$ = this.select((state) => state.entity).pipe(
    filter(Boolean),
    switchMap((entity) => this.modelService.selectEntityType(entity)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly entityProperties$ = this.entityType$.pipe(
    filter(Boolean),
    map((entityType) =>
      Object.values(entityType.properties).map((property) => ({ value: property.name, label: property.caption }))
    ),
    map((options) => [{ value: null, label: 'None' }, ...options])
  )

  getSchema() {
    return this.translate.stream('STORY_DESIGNER').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: 'Model Details',
                  icon: 'database'
                },
                fieldGroup: this.getModelSchema()
              }
            ]
          }
        ] as FormlyFieldConfig[]
      })
    )
  }

  getModelSchema() {
    return [
      {
        // type: 'model-info',
      },
      {
        key: 'preferences',
        props: {
          label: 'Preferences'
        },
        fieldGroup: []
      }
    ]
  }

  selectTableColumns(table: string) {
    return this.modelService.selectOriginalEntityProperties(table).pipe(
      map((properties) => {
        const options = [{ key: null, caption: this.getTranslation('PAC.KEY_WORDS.None', {Default: 'None'}) }]
        properties.forEach((property) => {
          options.push({ key: property.name, caption: property.caption })
        })
        return options
      })
    )
  }

}
