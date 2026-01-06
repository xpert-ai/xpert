import { Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { nonBlank } from '@metad/core'
import { DimensionType, DisplayBehaviour, getLevelsHierarchy, PropertyLevel } from '@metad/ocap-core'
import { AccordionWrappers, FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { ISelectOption } from '@metad/ocap-angular/core'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { combineLatest, Observable, of } from 'rxjs'
import { catchError, combineLatestWith, filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators'
import {
  CaptionExpressionAccordion,
  hiddenPropertiesAccordion,
  KeyExpressionAccordion,
  NameExpressionAccordion,
  OrdinalExpressionAccordion,
  ParentExpressionAccordion,
  SemanticsAccordionWrapper
} from '@cloud/app/@shared/model'
import { CubeSchemaService } from './cube.schema'

/**
 * Clean field name by removing SQL delimiters (brackets, quotes)
 * Examples:
 *   - "[uuid]" -> "uuid"
 *   - "table.[field]" -> "table.field"
 *   - '"field"' -> "field"
 */
function cleanFieldName(name: string): string {
  if (!name || typeof name !== 'string') {
    return ''
  }
  
  let cleaned = name.trim()
  
  // Split by dot to handle table.field format
  const parts = cleaned.split('.')
  const cleanedParts = parts.map(part => {
    let cleanPart = part.trim()
    // Remove square brackets: [field] -> field
    if (cleanPart.startsWith('[') && cleanPart.endsWith(']')) {
      cleanPart = cleanPart.slice(1, -1)
    }
    // Remove double quotes: "field" -> field
    if (cleanPart.startsWith('"') && cleanPart.endsWith('"')) {
      cleanPart = cleanPart.slice(1, -1)
    }
    // Remove backticks: `field` -> field
    if (cleanPart.startsWith('`') && cleanPart.endsWith('`')) {
      cleanPart = cleanPart.slice(1, -1)
    }
    // Remove single quotes: 'field' -> field
    if (cleanPart.startsWith("'") && cleanPart.endsWith("'")) {
      cleanPart = cleanPart.slice(1, -1)
    }
    return cleanPart
  })
  
  return cleanedParts.join('.')
}

@Injectable()
export class LevelSchemaService extends CubeSchemaService<PropertyLevel> {

  readonly _hierarchy$ = combineLatest([this.cube$, this.id$]).pipe(
    map(([cube, id]) => (cube?.dimensions ? getLevelsHierarchy(cube.dimensions, id) : null))
  )

  readonly hierarchy$ = this.select((state) => state.hierarchy).pipe(
    combineLatestWith(this._hierarchy$),
    map(([hierarchy, _hierarchy]) => hierarchy ?? _hierarchy)
  )

  readonly hierarchyTable$ = this.hierarchy$.pipe(
    map((hierarchy) => hierarchy?.primaryKeyTable ?? hierarchy?.tables?.[0]?.name)
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

  // Take the Level's own Table, otherwise take the Hierarchy's Table
  readonly table$ = combineLatest([
    this.select((state) => state.modeling?.table),
    this.hierarchyTable$,
    this.factName$
  ]).pipe(map(([lTable, hTable, fact]) => lTable ?? hTable ?? fact))

  /**
   * Column options for level configuration
   * In multi-table mode, load fields from all tables with table prefix
   */
  readonly columnOptions$: Observable<ISelectOption[]> = this.cube$.pipe(
    switchMap((cube) => {
      // Check if it's multi-table mode
      const isMultiTable = cube?.tables && cube.tables.length > 1
      
      if (isMultiTable) {
        // Multi-table mode: load fields from all tables
        const tableNames = cube.tables.map(t => t.name).filter(nonBlank)
        if (tableNames.length === 0) {
          return of([])
        }
        
        // Load properties from all tables and merge them
        return combineLatest(
          tableNames.map(tableName => 
            this.modelService.selectOriginalEntityProperties(tableName).pipe(
              map(properties => properties.map(p => {
                // Clean field name to remove SQL delimiters like brackets
                const cleanName = cleanFieldName(p.name)
                const cleanCaption = cleanFieldName(p.caption || p.name)
                return {
                  key: `${tableName}.${cleanName}`,
                  value: `${tableName}.${cleanName}`,
                  // Display table prefix in caption for dropdown selection
                  caption: `${tableName}.${cleanCaption}`
                }
              })),
              catchError(() => of([]))
            )
          )
        ).pipe(
          map((allProperties) => {
            const options: ISelectOption[] = [
              {
                key: null,
                value: null,
                caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
              }
            ]
            // Flatten all properties
            allProperties.flat().forEach(prop => {
              options.push(prop)
            })
            return options
          })
        )
      } else {
        // Single table mode: use original logic
        return this.table$.pipe(
          filter((table) => !!table),
          switchMap((table) => this.modelService.selectOriginalEntityProperties(table)),
          map((properties) => {
            const options: ISelectOption[] = [
              {
                key: null,
                value: null,
                caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
              }
            ]
            properties?.forEach((property) => {
              // Clean field name to remove SQL delimiters like brackets
              const cleanName = cleanFieldName(property.name)
              const cleanCaption = cleanFieldName(property.caption || property.name)
              options.push({ key: cleanName, value: cleanName, caption: cleanCaption })
            })
            return options
          })
        )
      }
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  private LEVEL: any

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        this.LEVEL = SCHEMA.LEVEL
        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: this.LEVEL?.Level ?? 'Level',
                  icon: 'format_list_numbered'
                },
                fieldGroup: [this.levelModeling]
              }
              // this.role as any
            ] as FormlyFieldConfig[]
          }
        ]
      })
    )
  }

  get levelModeling() {
    const COMMON = this.SCHEMA.COMMON
    const LEVEL = this.LEVEL
    const className = FORMLY_W_1_2
    return {
      key: 'modeling',
      fieldGroup: [
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
                options: ValueTypes(LEVEL),
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
              },
            },
            {
              className,
              key: 'ordinalColumn',
              type: 'ngm-select',
              props: {
                label: LEVEL?.OrdinalColumn ?? 'Ordinal Column',
                help: this.helpDimensionUrl() + '/hierarchy/#' + this.i18n.instant('PAC.MODEL.OrdinalColumnTag', {Default: 'ordinal-column'}),
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
                help: this.helpDimensionUrl() + '/parent-child/#' + this.i18n.instant('PAC.MODEL.ParentColumnTag', {Default: 'parent-member-field'})
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
                help: this.helpDimensionUrl() + '/parent-child/#' + this.i18n.instant('PAC.MODEL.NullParentValueTag', {Default: 'top-level-node-identifier'})
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
                required: this.get((state) => state.dimension?.type === DimensionType.TimeDimension),
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
                help: this.helpDimensionUrl() + '/hierarchy/#' + this.i18n.instant('PAC.MODEL.HideMemberTag', {Default: 'hide-member'}),
                options: [
                  { value: null, label: this.getTranslation('PAC.MODEL.HideMember_None', { Default: 'None(Never)' }) },
                  { value: 'Never', label: this.i18n.instant('PAC.MODEL.HideMember_Never', {Default: 'Never'}) },
                  { value: 'IfBlankName', label: this.i18n.instant('PAC.MODEL.HideMember_IfBlankName', {Default: 'If Name is Empty'}) },
                  { value: 'IfParentsName', label: this.i18n.instant('PAC.MODEL.HideMember_IfParentsName', {Default: 'If Name Matches Parent'}) }
                ]
              }
            }
          ]
        },

        ...SemanticsAccordionWrapper(
          COMMON,
          this.helpDimensionUrl() + '/semantics/',
          hiddenPropertiesAccordion(COMMON),
          
        ),
        ...AccordionWrappers([
          KeyExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
          NameExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
          CaptionExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
          OrdinalExpressionAccordion(COMMON, this.helpDimensionUrl() + '/hierarchy/'),
          ParentExpressionAccordion(COMMON, this.helpDimensionUrl() + '/parent-child/#' + this.i18n.instant('PAC.MODEL.ParentExpressionTag', {Default: 'custom-parent-expression'})),
          this.closureAccordion(LEVEL, className),
          this.propertyAccordion(COMMON, LEVEL, className)
        ])
      ]
    }
  }

  closureAccordion(LEVEL, className: string) {
    return {
      key: 'closure',
      label: LEVEL?.ClosureTable ?? 'Closure Table',
      toggleable: true,
      props: {
        help: this.helpDimensionUrl() + '/parent-child/#' + this.i18n.instant('PAC.MODEL.ClosureTag', {Default: 'closure-table'})
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
                key: 'caption',
                type: 'input',
                props: {
                  label: COMMON?.Caption ?? 'Caption'
                }
              }
            ]
          },
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [
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
              },
              {
                className,
                key: 'type',
                type: 'ngm-select',
                props: {
                  label: LEVEL?.Type ?? 'Type',
                  options: ValueTypes(LEVEL),
                }
              },
            ]
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
}

function ValueTypes(LEVEL: Record<string, string>) {
  return [
    {
      value: null,
      label: LEVEL?.Type_Null ?? ''
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