import { computed, Injectable } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { nonBlank } from '@metad/core'
import { ISelectOption } from '@metad/ocap-angular/core'
import { Cube } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { Observable, combineLatest, of } from 'rxjs'
import { catchError, filter, map, shareReplay, switchMap } from 'rxjs/operators'
import { EntitySchemaService } from './entity-schema.service'
import { CubeSchemaState } from './types'

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
export class CubeSchemaService<T = Cube> extends EntitySchemaService<CubeSchemaState<T>> {

  readonly helpDimensionUrl = computed(() => this.helpWebsite() + '/docs/models/dimension-designer')

  readonly sharedDimensions$ = this.modelService.sharedDimensions$

  readonly cube$ = this.select((state) => state.cube)
  readonly cubeName$ = this.cube$.pipe(map((cube) => cube?.name))
  // Fact name (table or sql alias)
  readonly factName$ = this.cube$.pipe(map((cube) => {
      if (!cube) return null;
      if (cube.fact?.type === 'table') {
        return cube.fact.table?.name
      } else if (cube.fact?.type === 'view') {
        return cube.fact.view?.alias
      } else {
        return cube?.tables?.[0]?.name
      }
    })
  )

  readonly measures$ = this.cube$.pipe(
    map((cube) => {
      const measures = [
        {
          key: null,
          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
        }
      ]

      if (cube.measures) {
        measures.push(
          ...cube.measures.map((measure) => ({
            key: measure.name,
            caption: measure.caption
          }))
        )
      }

      return measures
    })
  )

  /**
   * Get fields from the fact table (not cube name)
   * Uses the actual table name from cube.fact.table or cube.tables[0]
   */
  readonly fields$ = this.cube$.pipe(
    filter(Boolean),
    map((cube) => {
      // Get actual table name from cube configuration
      // Priority: cube.tables[0].name > cube.fact.table.name > cube.fact.table
      if (cube.tables && cube.tables.length > 0 && cube.tables[0]?.name) {
        return cube.tables[0].name
      }
      if (cube.fact?.table) {
        return typeof cube.fact.table === 'string' ? cube.fact.table : cube.fact.table.name
      }
      return null
    }),
    filter(Boolean),
    switchMap((tableName) => this.modelService.selectOriginalEntityProperties(tableName).pipe(
      catchError((error) => {
        console.warn(`[CubeSchemaService] Error loading fields for table "${tableName}":`, error)
        return of([])
      })
    )),
    map((properties) => [
      { value: null, label: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) },
      ...properties.map((property) => ({ value: property.name, label: property.caption }))
    ]),
    takeUntilDestroyed(this.destroyRef),
    shareReplay(1)
  )

  /**
   * Original Fact table fields
   * In multi-table mode, merge fields from all tables
   */
  readonly factFields$ = this.cube$.pipe(
    switchMap((cube) => {
      if (!cube) {
        return of([])
      }
      
      // Check if it's multi-table mode (has multiple tables)
      const isMultiTable = cube.tables && cube.tables.length > 1
      
      if (isMultiTable) {
        // Multi-table mode: merge fields from all tables
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
                  ...p,
                  // Add table prefix to field name to avoid conflicts
                  name: `${tableName}.${cleanName}`,
                  // Display table prefix in caption for dropdown selection
                  caption: `${tableName}.${cleanCaption}`
                }
              }))
            )
          )
        ).pipe(
          map((allProperties) => {
            // Flatten and deduplicate properties
            const merged = allProperties.flat()
            const unique = new Map()
            merged.forEach(prop => {
              if (!unique.has(prop.name)) {
                unique.set(prop.name, prop)
              }
            })
            return Array.from(unique.values())
          }),
          map((properties) => [
            {
              value: null,
              key: null,
              caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
            },
            ...properties.map((property) => ({
              value: property.name,
              key: property.name,
              caption: property.caption
            }))
          ])
        )
      } else {
        // Single table mode: use fact table name
        const factName = this.factName$.pipe(
          filter(nonBlank),
          takeUntilDestroyed(this.destroyRef)
        )
        return factName.pipe(
          switchMap((table) => this.modelService.selectOriginalEntityProperties(table)),
          map((properties) => [
            {
              value: null,
              key: null,
              caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
            },
            ...properties.map((property) => {
              // Clean field name to remove SQL delimiters like brackets
              const cleanName = cleanFieldName(property.name)
              const cleanCaption = cleanFieldName(property.caption || property.name)
              return {
                value: cleanName,
                key: cleanName,
                caption: cleanCaption
              }
            })
          ])
        )
      }
    }),
    takeUntilDestroyed(this.destroyRef),
    shareReplay(1)
  )

  readonly cube = toSignal(this.cube$)

  readonly dimension$ = this.select((state) => state.dimension)
  readonly otherDimensions = toSignal(
    combineLatest([
      this.dimension$.pipe(map((dimension) => dimension?.__id__)),
      this.cube$.pipe(map((cube) => cube?.dimensions))
    ]).pipe(map(([id, dimensions]) => dimensions?.filter((dimension) => dimension.__id__ !== id) ?? []))
  )
  readonly tableOptions$ = this.tables$.pipe(
    map((tables) => tables?.map((_) => ({ value: _.key, label: _.caption || _.key })))
  )

  SCHEMA: any

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA
        const CUBE = this.SCHEMA?.CUBE
        return [
          {
            type: 'tabs',
            fieldGroup: [
              {
                props: {
                  label: CUBE?.TITLE ?? 'Cube',
                  icon: 'crop_free'
                },
                fieldGroup: [this.cubeModeling]
              }
            ]
          }
        ] as FormlyFieldConfig[]
      })
    )
  }

  get cubeModeling() {
    const COMMON = this.SCHEMA?.COMMON
    const CUBE = this.SCHEMA?.CUBE
    const className = FORMLY_W_1_2
    return {
      key: 'modeling',
      wrappers: ['panel'],
      props: {
        label: CUBE?.Modeling ?? 'Modeling',
        padding: true
      },
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              key: 'name',
              type: 'input',
              className,
              props: {
                label: CUBE?.Name ?? 'Name'
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
              key: 'defaultMeasure',
              type: 'ngm-select',
              props: {
                label: CUBE?.DefaultMeasure ?? 'Default Measure',
                valueKey: 'key',
                options: this.measures$,
                searchable: true
                // required: true
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
              className,
              key: 'enabled',
              type: 'checkbox',
              defaultValue: true,
              props: {
                label: COMMON?.Enabled ?? 'Enabled'
              }
            },
            {
              className,
              key: 'cache',
              type: 'checkbox',
              defaultValue: true,
              props: {
                label: COMMON?.Cache ?? 'Cache'
              }
            }
          ]
        },
        {
          key: 'fact',
          type: 'fact',
          props: {
            label: COMMON?.FactTable ?? 'Fact Table',
            valueKey: 'key',
            options$: this.tableOptions$
          },
          className: 'my-4'
        },
        {
          ...Tables(COMMON, this.tables$),
          // Hide deprecated Tables field in multi-table mode
          // In multi-table mode, tables are managed through the fact.type component
          // Use hideExpression function that checks both model state and form control value
          hideExpression: (model, formState, field) => {
            const cube = model as Cube
            
            // Method 1: Check if fact formControl has _mode marker set to 'multi-table'
            let factMode = null
            try {
              if (field.parent?.fieldGroup) {
                const factField = field.parent.fieldGroup.find(f => f.key === 'fact')
                if (factField?.formControl?.value?._mode === 'multi-table') {
                  factMode = 'multi-table'
                }
              }
            } catch (e) {
              // Ignore errors
            }
            
            // Method 2: Check model state - has multiple tables and no fact.type
            const hasMultipleTables = cube?.tables && cube.tables.length > 1
            const hasNoFactType = !cube?.fact?.type
            
            // Method 3: Try to get fact.type formControl value from parent fieldGroup
            let factTypeValue = null
            try {
              if (field.parent?.fieldGroup) {
                const factField = field.parent.fieldGroup.find(f => f.key === 'fact')
                if (factField?.fieldGroup) {
                  const factTypeField = factField.fieldGroup.find(f => f.key === 'type')
                  if (factTypeField?.formControl) {
                    factTypeValue = factTypeField.formControl.value
                  }
                }
              }
            } catch (e) {
              // Ignore errors when accessing formControl
            }
            
            // Hide if any of these conditions are true:
            // 1. fact formControl has _mode === 'multi-table' (most reliable)
            // 2. fact.type formControl value is 'multi-table'
            // 3. has multiple tables and no fact.type (fallback)
            const isMultiTable = factMode === 'multi-table' || 
                                 factTypeValue === 'multi-table' || 
                                 (hasMultipleTables && hasNoFactType)
            
            return isMultiTable
          },
          // Also use expressions.hide for reactive updates
          expressions: {
            // This expression will be re-evaluated when model or form values change
            hide: `(model?.tables && model.tables.length > 1 && !model?.fact?.type) || (field?.parent?.fieldGroup?.find(f => f.key === 'fact')?.formControl?.value?._mode === 'multi-table')`
          }
        }
      ]
    }
  }

  get dataDistribution() {
    const COMMON = this.SCHEMA?.COMMON
    return {
      key: 'dataDistribution',
      props: {
        label: COMMON?.DATA || 'Data',
        icon: 'data_array'
      },
      fieldGroup: []
    }
  }

  get role() {
    const COMMON = this.SCHEMA?.COMMON
    return {
      key: 'role',
      props: {
        label: COMMON?.Role || 'Role',
        icon: 'policy'
      },
      fieldGroup: []
    }
  }

  getTranslationFun() {
    return (key: string, interpolateParams?: any) => {
      return this.getTranslation(key, interpolateParams)
    }
  }
}

/**
 * @deprecated use table in `fact` attribute
 */
export function Tables(COMMON, tables$: Observable<ISelectOption[]>) {
  return {
    key: 'tables',
    type: 'array',
    fieldArray: {
      fieldGroup: [
        {
          key: 'name',
          type: 'ngm-select',
          props: {
            label: COMMON?.Table ?? 'Table',
            searchable: true,
            valueKey: 'key',
            options: tables$
          }
        }
      ]
    },
    props: {
      label: COMMON?.FactTable ?? 'Fact Table',
      deprecated: 'Use table in `Fact` attribute'
    }
  }
}
