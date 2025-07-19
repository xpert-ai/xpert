import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  model,
  output,
} from '@angular/core'
import { AbstractControl, FormGroup, FormsModule } from '@angular/forms'
import { PropertyDimension, PropertyHierarchy, serializeUniqueName } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/formly'
import { injectHelpWebsite } from '@cloud/app/@core'
import { DensityDirective } from '@metad/ocap-angular/core'
import { map, shareReplay, switchMap } from 'rxjs/operators'
import { AccordionWrappers } from '@metad/story/designer'
import { ModelStudioService } from '../../studio.service'
import { CubeStudioComponent } from '../../studio.component'
import { take, pipe, combineLatest } from 'rxjs'
import { HiddenLLM } from '../../types'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-dimension-settings',
  templateUrl: 'settings.component.html',
  styleUrls: ['settings.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-dimension-settings'
  }
})
export class CubeStudioDimensionSettingsComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly translate = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly dimension = model<PropertyDimension>()
  readonly hierarchy = model<PropertyHierarchy>()

  // Outputs
  readonly close = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getHierarchyFields())
  readonly options = {}
  readonly model = model<PropertyDimension>({} as PropertyDimension)

  // States
  readonly SCHEMA = toSignal(this.translate.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  readonly dimensionName = computed(() => this.dimension()?.name)
  readonly hierarchyName = computed(() => this.hierarchy()?.name)
  readonly hierarchy$ = toObservable(this.hierarchy)
  readonly otherHierarchies = computed(() => {
    const hierarchies = this.dimension().hierarchies
    return hierarchies?.filter((item) => item.__id__ !== this.hierarchy()?.__id__)
  })
  /**
   * For dimensions that relate multiple tables, you need to specify `primaryKeyTable` for the Hierarchy
   */
  readonly hierarchyTables$ = this.hierarchy$.pipe(
    map((hierarchy) => hierarchy?.tables?.map((table) => ({
      key: table.name,
      value: table.name,
      caption: table.name
    })) ?? [])
  )
  readonly tables$ = this.studioService.selectDBTables().pipe(
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

  readonly table$ = this.hierarchy$.pipe(
    map((hierarchy) => hierarchy?.primaryKeyTable || hierarchy?.tables?.[0]?.name
  ))

  readonly members$ = combineLatest([toObservable(this.dimensionName), toObservable(this.hierarchyName)]).pipe(
    switchMap(([dimension, hierarchy]) =>
      this.studioService
        .selectOriginalMembers(dimension, {
          dimension: serializeUniqueName(dimension),
          hierarchy: serializeUniqueName(dimension, hierarchy)
        }).pipe(
          // selectMembers Frequent refreshes cause abnormal display of ngm-select components
          take(1)
        )
      )
    )

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }

  getTranslation(key: string, interpolateParams?: any) {
    return this.translate.instant(key, interpolateParams)
  }

   getTranslationFun() {
    return (key: string, interpolateParams?: any) => {
      return this.translate.instant(key, interpolateParams)
    }
  }

  getHierarchyFields() {
    const COMMON = this.SCHEMA().COMMON
    const HIERARCHY = this.HIERARCHY()
    const className = FORMLY_W_1_2
    const allMemberHide = `model === null || !model.hasAll`
    const translate = this.getTranslationFun()
    return [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                key: 'name',
                type: 'input',
                className,
                props: {
                  label: HIERARCHY?.Name ?? 'Name'
                },
                validators: {
                  name: {
                    expression: (c: AbstractControl) => !this.otherHierarchies()?.find((item) => item.name === c.value),
                    message: (error: any, field: FormlyFieldConfig) => {
                      if (error) {
                        return field.formControl.value ? translate('PAC.Messages.AlreadyExists', {
                          Default: `Name already exists`,
                          value: translate('PAC.KEY_WORDS.Name', { Default: 'Name' })
                        })
                        : translate('PAC.Messages.IsRequired', {
                          Default: `Name is required`,
                          value: translate('PAC.KEY_WORDS.Name', { Default: 'Name' })
                        })
                      } else {
                        return null
                      }
                    }
                  }
                }
              },
              {
                key: 'caption',
                type: 'input',
                className,
                props: {
                  label: COMMON?.Caption ?? 'Caption'
                }
              },
              {
                className: FORMLY_W_FULL,
                key: 'description',
                type: 'textarea',
                props: {
                  label: COMMON?.Description ?? 'Description',
                  autosizeMinRows: 2,
                  autosize: true
                }
              }
            ]
          },
  
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                className,
                key: 'visible',
                type: 'checkbox',
                defaultValue: true,
                props: {
                  label: COMMON?.Visible ?? 'Visible',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                }
              },
              {
                key: 'hasAll',
                type: 'checkbox',
                defaultValue: true,
                className,
                props: {
                  label: HIERARCHY?.HasAll ?? 'Has All',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                }
              },
              {
                key: 'allMemberName',
                type: 'input',
                className,
                props: {
                  label: HIERARCHY?.AllMemberName ?? 'All Member Name',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                },
                expressions: {
                  hide: allMemberHide
                }
              },
              {
                key: 'allMemberCaption',
                type: 'input',
                className,
                props: {
                  label: HIERARCHY?.AllMemberCaption ?? 'All Member Caption',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                },
                expressions: {
                  hide: allMemberHide
                }
              },
              {
                key: 'allLevelName',
                type: 'input',
                className,
                props: {
                  label: HIERARCHY?.AllLevelName ?? 'All Level Name',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                },
                expressions: {
                  hide: allMemberHide
                }
              }
            ]
          },
          {
            key: 'tables',
            type: 'array',
            props: {
              icon: 'table_view',
              label: HIERARCHY?.DimensionTable ?? 'Dimension Table',
              help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
              required: true,
            },
            fieldArray: {
              fieldGroup: [
                {
                  type: 'empty',
                  key: 'join'
                },
                {
                  key: 'name',
                  type: 'select',
                  props: {
                    label: HIERARCHY?.TableName ?? 'Table Name',
                    searchable: true,
                    required: true,
                    valueKey: 'key',
                    options: this.tables$
                  }
                }
              ]
            }
          },
          {
            fieldGroupClassName: FORMLY_ROW + ' ngm-formly__my-2',
            fieldGroup: [
              {
                key: 'primaryKey',
                type: 'ngm-select',
                className,
                props: {
                  icon: 'view_column',
                  label: HIERARCHY?.PrimaryKey ?? 'Primary Key',
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
                  searchable: true,
                  valueKey: 'key',
                  options: this.table$.pipe(
                    switchMap((table) => this.studioService.selectOriginalEntityProperties(table)),
                    map((properties) => {
                      const columns = [
                        {
                          key: null,
                          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
                        }
                      ]
                      properties?.forEach((property) => columns.push({
                        key: property.name,
                        caption: property.caption
                      }))
                      return columns
                    })
                  )
                },
                expressions: {
                  'props.required': '!!model.tables && !!model.tables.length'
                }
              },
              {
                key: 'primaryKeyTable',
                type: 'select',
                className,
                props: {
                  icon: 'view_column',
                  label: HIERARCHY?.PrimaryKeyTable ?? 'Primary Key Table',
                  options: this.hierarchyTables$,
                  help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/'
                },
                expressionProperties: {
                  'props.required': '!!model.tables && model.tables.length > 1'
                }
              }
            ]
          },
  
          this.defaultMember(),
  
          ...AccordionWrappers([
            {
              key: 'semantics',
              label: COMMON?.Semantics ?? 'Semantics',
              toggleable: true,
              props: {
                help: this.helpWebsite() + '/docs/models/dimension-designer/semantics/'
              },
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                HiddenLLM(COMMON),
              ]
            }
          ])
        ]
  }

    get hierarchySchema() {
      const HIERARCHY = this.HIERARCHY()
      return {
        key: 'hierarchy',
        wrappers: ['panel'],
        props: {
          label: HIERARCHY?.Modeling ?? 'Modeling',
          padding: true
        },
        fieldGroup: []
      }
    }
  
    defaultMember() {
      return {
        className: FORMLY_W_FULL,
        key: 'defaultMember',
        type: 'ngm-select',
        props: {
          label: this.SCHEMA()?.HIERARCHY?.DefaultMember ?? 'Default Member',
          help: this.helpWebsite() + '/docs/models/dimension-designer/hierarchy/',
          searchable: true,
          virtualScroll: true,
          options: this.members$.pipe(
            map((members) => [
              {
                value: null,
                label: this.translate.instant('PAC.KEY_WORDS.None', { Default: 'None' }),
                key: null,
                caption: this.translate.instant('PAC.KEY_WORDS.None', { Default: 'None' })
              },
              ...(members ?? []).map((member) => ({
                value: member.memberKey,
                label: member.memberCaption,
                key: member.memberKey,
                caption: member.memberCaption
              }))
            ])
          )
        }
      }
    }
}
