import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  model,
  output
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule } from '@angular/forms'
import { injectHelpWebsite } from '@cloud/app/@core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/formly'
import { DensityDirective, ISelectOption } from '@metad/ocap-angular/core'
import { DimensionType, DisplayBehaviour, PropertyDimension, PropertyHierarchy, PropertyLevel } from '@metad/ocap-core'
import { AccordionWrappers } from '@metad/story/designer'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { Observable } from 'rxjs'
import { filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../studio.service'
import {
  CaptionExpressionAccordion,
  KeyExpressionAccordion,
  NameExpressionAccordion,
  OrdinalExpressionAccordion,
  ParentExpressionAccordion,
  SemanticsAccordionWrapper
} from '../../types'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-dimension-level',
  templateUrl: 'level.component.html',
  styleUrls: ['level.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-dimension-level'
  }
})
export class CubeStudioDimensionLevelComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()
  readonly helpDimensionUrl = computed(() => this.helpWebsite() + '/docs/models/dimension-designer')

  // Inputs
  readonly dimension = model<PropertyDimension>()
  readonly hierarchy = model<PropertyHierarchy>()
  readonly level = model<PropertyLevel>()

  // Outputs
  readonly close = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getFields())
  readonly options = {}

  // States
  readonly SCHEMA = toSignal(this.i18n.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  readonly hierarchy$ = toObservable(this.hierarchy)
  readonly dimensionName = computed(() => this.dimension()?.name)
  readonly dimensionType = computed(() => this.dimension()?.type)
  readonly hierarchyName = computed(() => this.hierarchy()?.name)
  readonly hierarchyTable = computed(() => this.hierarchy()?.primaryKeyTable ?? this.hierarchy()?.tables?.[0]?.name)
  // Fact name (table or sql alias)
  readonly factName = computed(() => {
    const cube = this.studio.cube()
    if (!cube) return null
    if (cube.fact?.type === 'table') {
      return cube.fact.table?.name
    } else if (cube.fact?.type === 'view') {
      return cube.fact.view?.alias
    } else {
      return cube?.tables?.[0]?.name
    }
  })
  readonly levelTable = computed(() => this.level()?.table)

  // Take the Level's own Table, otherwise take the Hierarchy's Table
  readonly table = computed(() => this.levelTable() ?? this.hierarchyTable() ?? this.factName())

  readonly columnOptions$: Observable<ISelectOption[]> = toObservable(this.table).pipe(
    filter((table) => !!table),
    switchMap((table) => this.studioService.selectOriginalEntityProperties(table)),
    map((properties) => {
      const options = [
        {
          key: null,
          value: null,
          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
        }
      ]
      properties?.forEach((property) => {
        options.push({ key: property.name, value: property.name, caption: property.caption })
      })
      return options
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly hierarchyTables$ = this.hierarchy$.pipe(
    map((hierarchy) => {
      const options = [
        {
          value: null,
          key: null,
          caption: this.getTranslation('PAC.KEY_WORDS.Default', { Default: 'Default' })
        }
      ]
      hierarchy?.tables.forEach((table) => {
        options.push({
          value: table.name,
          key: table.name,
          caption: table.name
        })
      })
      return options
    })
  )

  public readonly tables$ = this.studioService.selectDBTables().pipe(
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

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }

  getTranslation(key: string, interpolateParams?: any) {
    return this.i18n.instant(key, interpolateParams)
  }

  getTranslationFun() {
    return (key: string, interpolateParams?: any) => {
      return this.i18n.instant(key, interpolateParams)
    }
  }

  getFields() {
    const COMMON = this.SCHEMA().COMMON
    const LEVEL = this.SCHEMA().LEVEL
    const className = FORMLY_W_1_2
    return [
      {
        wrappers: ['panel'],
        props: {
          label: LEVEL?.Modeling ?? 'Modeling',
          padding: true
        },
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'name',
            type: 'input',
            className,
            props: {
              label: LEVEL?.Name ?? 'Name',
              required: true
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
              rows: 1,
              autosize: true
            }
          },
          {
            className,
            key: 'visible',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Visible ?? 'Visible'
            }
          },
          {
            key: 'uniqueMembers',
            type: 'checkbox',
            className,
            props: {
              label: LEVEL?.UniqueMembers ?? 'Unique Members',
              help: this.helpDimensionUrl() + '/hierarchy/'
            },
            expressions: {
              'props.required': '!!model && !!model.closure'
            }
          },
          {
            key: 'column',
            type: 'ngm-select',
            className,
            props: {
              label: LEVEL?.Column ?? 'Column',
              required: true,
              searchable: true,
              options: this.columnOptions$,
              valueKey: 'key'
            }
          },
          {
            key: 'type',
            type: 'select',
            className,
            props: {
              label: LEVEL?.Type ?? 'Type',
              help: this.helpDimensionUrl() + '/hierarchy/',
              options: [
                {
                  value: null,
                  label: LEVEL?.Type_Null ?? this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
                },
                { value: 'String', label: LEVEL?.Type_String ?? 'String' },
                { value: 'Integer', label: LEVEL?.Type_Integer ?? 'Integer' },
                { value: 'Numeric', label: LEVEL?.Type_Numeric ?? 'Numeric' },
                { value: 'Boolean', label: LEVEL?.Type_Boolean ?? 'Boolean' },
                { value: 'Date', label: LEVEL?.Type_Date ?? 'Date' },
                { value: 'Time', label: LEVEL?.Type_Time ?? 'Time' },
                { value: 'Timestamp', label: LEVEL?.Type_Timestamp ?? 'Timestamp' }
              ]
            }
          },
          {
            className,
            key: 'nameColumn',
            type: 'ngm-select',
            props: {
              label: LEVEL?.NameColumn ?? 'Name Column',
              searchable: true,
              options: this.columnOptions$,
              valueKey: 'key'
            }
          },
          {
            className,
            key: 'captionColumn',
            type: 'ngm-select',
            props: {
              label: LEVEL?.CaptionColumn ?? 'Caption Column',
              searchable: true,
              options: this.columnOptions$,
              valueKey: 'key'
            },
            expressions: {
              'props.disabled': `!!model && !!model.parentColumn`
            }
          },
          {
            className,
            key: 'ordinalColumn',
            type: 'ngm-select',
            props: {
              label: LEVEL?.OrdinalColumn ?? 'Ordinal Column',
              help:
                this.helpDimensionUrl() +
                '/hierarchy/#' +
                this.i18n.instant('PAC.MODEL.OrdinalColumnTag', { Default: 'ordinal-column' }),
              searchable: true,
              options: this.columnOptions$,
              valueKey: 'key'
            }
          },
          {
            className,
            key: 'parentColumn',
            type: 'ngm-select',
            props: {
              label: LEVEL?.ParentColumn ?? 'Parent Column',
              searchable: true,
              options: this.columnOptions$,
              valueKey: 'key',
              help:
                this.helpDimensionUrl() +
                '/parent-child/#' +
                this.i18n.instant('PAC.MODEL.ParentColumnTag', { Default: 'parent-member-field' })
            }
          },
          {
            className,
            key: 'nullParentValue',
            type: 'input',
            expressions: {
              hide: `!model || !model.parentColumn`
            },
            props: {
              label: LEVEL?.NullParentValue ?? 'Null Parent Value',
              help:
                this.helpDimensionUrl() +
                '/parent-child/#' +
                this.i18n.instant('PAC.MODEL.NullParentValueTag', { Default: 'top-level-node-identifier' })
            }
          },
          {
            className,
            key: 'table',
            type: 'ngm-select',
            props: {
              label: LEVEL?.Table ?? 'Table',
              icon: 'table_view',
              searchable: true,
              options: this.hierarchyTables$
            }
          },
          {
            key: 'levelType',
            type: 'select',
            className,
            props: {
              label: LEVEL?.TimeLevelType ?? 'Time Level Type',
              icon: 'date_range',
              required: this.dimensionType() === DimensionType.TimeDimension,
              displayBehaviour: DisplayBehaviour.descriptionOnly,
              help: this.helpDimensionUrl() + '/calendar/',
              options: [
                { value: null, label: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) },
                { value: 'TimeYears', label: 'Year' },
                { value: 'TimeQuarters', label: 'Quarter' },
                { value: 'TimeMonths', label: 'Month' },
                { value: 'TimeWeeks', label: 'Week' },
                { value: 'TimeDays', label: 'Day' }
              ]
            }
          },
          {
            className,
            key: 'hideMemberIf',
            type: 'select',
            props: {
              label: LEVEL?.HideMemberIf ?? 'Hide Member If',
              displayBehaviour: DisplayBehaviour.descriptionOnly,
              help:
                this.helpDimensionUrl() +
                '/hierarchy/#' +
                this.i18n.instant('PAC.MODEL.HideMemberTag', { Default: 'hide-member' }),
              options: [
                { value: null, label: this.getTranslation('PAC.MODEL.HideMember_None', { Default: 'None(Never)' }) },
                { value: 'Never', label: this.i18n.instant('PAC.MODEL.HideMember_Never', { Default: 'Never' }) },
                {
                  value: 'IfBlankName',
                  label: this.i18n.instant('PAC.MODEL.HideMember_IfBlankName', { Default: 'If Name is Empty' })
                },
                {
                  value: 'IfParentsName',
                  label: this.i18n.instant('PAC.MODEL.HideMember_IfParentsName', { Default: 'If Name Matches Parent' })
                }
              ]
            }
          }
        ]
      },

      ...SemanticsAccordionWrapper(COMMON, this.helpDimensionUrl() + '/semantics/'),
      ...AccordionWrappers([
        KeyExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
        NameExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
        CaptionExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
        OrdinalExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
        ParentExpressionAccordion(
          COMMON,
          this.helpDimensionUrl() +
            '/parent-child/#' +
            this.i18n.instant('PAC.MODEL.ParentExpressionTag', { Default: 'custom-parent-expression' })
        ),
        this.closureAccordion(LEVEL, className),
        this.propertyAccordion(COMMON, LEVEL, className)
      ])
    ]
  }

  closureAccordion(LEVEL, className: string) {
    return {
      key: 'closure',
      label: LEVEL?.ClosureTable ?? 'Closure Table',
      toggleable: true,
      props: {
        help:
          this.helpDimensionUrl() +
          '/parent-child/#' +
          this.i18n.instant('PAC.MODEL.ClosureTag', { Default: 'closure-table' })
      },
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className: FORMLY_W_FULL,
          key: 'table',
          fieldGroup: [
            {
              key: 'name',
              type: 'ngm-select',
              props: {
                label: LEVEL?.Table ?? 'Table',
                searchable: true,
                options: this.tables$
              }
            }
          ]
        },
        {
          className,
          key: 'parentColumn',
          type: 'ngm-select',
          props: {
            label: LEVEL?.ParentColumn ?? 'Parent Column',
            searchable: true,
            valueKey: 'key'
          },
          hooks: {
            onInit: (field: FormlyFieldConfig) => {
              const tableControl = field.parent.fieldGroup[0].formControl.get('name')
              field.props.options = tableControl.valueChanges.pipe(
                startWith(tableControl.value),
                filter((table) => !!table),
                switchMap((table) => this.selectTableColumns(table))
              )
            }
          }
        },
        {
          className,
          key: 'childColumn',
          type: 'ngm-select',
          props: {
            label: LEVEL?.ChildColumn ?? 'Child Column',
            searchable: true,
            valueKey: 'key'
          },
          hooks: {
            onInit: (field: FormlyFieldConfig) => {
              const tableControl = field.parent.fieldGroup[0].formControl.get('name')
              field.props.options = tableControl.valueChanges.pipe(
                startWith(tableControl.value),
                filter((table) => !!table),
                switchMap((table) => this.selectTableColumns(table))
              )
            }
          }
        }
      ]
    }
  }

  propertyAccordion(COMMON, LEVEL, className) {
    return {
      key: 'properties',
      type: 'array',
      label: LEVEL?.Property ?? 'Property',
      toggleable: true,
      props: {
        help: this.helpDimensionUrl() + '/hierarchy/'
      },
      fieldArray: {
        fieldGroup: [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
              {
                className,
                key: 'name',
                type: 'input',
                props: {
                  label: LEVEL?.Name ?? 'Name',
                  appearance: 'standard'
                }
              },
              {
                className,
                key: 'column',
                type: 'ngm-select',
                props: {
                  label: LEVEL?.Column ?? 'Column',
                  searchable: true,
                  options: this.columnOptions$,
                  valueKey: 'key'
                }
              }
            ]
          },
          {
            className: FORMLY_W_FULL,
            key: 'caption',
            type: 'input',
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
              rows: 1,
              autosize: true
            }
          }

          // Mondrian 不支持？
          // {
          //   key: 'propertyExpression',
          //   wrappers: ['panel'],
          //   props: {
          //     label: LEVEL?.PropertyExpression ?? 'Property Expression'
          //   },
          //   fieldGroup: [SQLExpression(LEVEL)]
          // }
        ]
      }
    }
  }

  selectTableColumns(table: string) {
    return this.studioService.selectOriginalEntityProperties(table).pipe(
      map((properties) => {
        const options = [{ key: null, caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) }]
        properties.forEach((property) => {
          options.push({ key: property.name, caption: property.caption })
        })
        return options
      })
    )
  }
}
