import { computed, Injectable } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { nonBlank } from '@metad/core'
import { ISelectOption } from '@metad/ocap-angular/core'
import { Cube } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { Observable, combineLatest } from 'rxjs'
import { filter, map, shareReplay, switchMap } from 'rxjs/operators'
import { EntitySchemaService } from './entity-schema.service'
import { CubeSchemaState } from './types'

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

  readonly factTables$ = this.cube$.pipe(
    map((cube) => {
      if (!cube) {
        return []
      }
      const tables = []
      switch (cube.fact?.type) {
        case 'table':
          if (cube.fact.table) {
            tables.push(cube.fact.table)
          }
          break
        case 'tables':
          if (cube.fact.tables) {
            tables.push(...cube.fact.tables)
          }
          break
        case 'view':
          if (cube.fact.view) {
            tables.push({ key: cube.fact.view.alias, caption: cube.fact.view.alias })
          }
          break
        default:
          if (cube.tables) {
            tables.push(...cube.tables)
          }
      }
      return tables
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

  readonly fields$ = this.cubeName$.pipe(
    filter(Boolean),
    switchMap((cubeName) => this.modelService.selectOriginalEntityProperties(cubeName)),
    map((properties) => [
      { value: null, label: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) },
      ...properties.map((property) => ({ value: property.name, label: property.caption }))
    ]),
    takeUntilDestroyed(this.destroyRef),
    shareReplay(1)
  )

  /**
   * Original Fact table fields
   */
  readonly factFields$ = this.factName$.pipe(
    filter(nonBlank),
    switchMap((table) => this.modelService.selectOriginalEntityProperties(table)),
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
    return combineLatest([this.translate.stream('PAC.MODEL.SCHEMA'), this.modelService.modelType$]).pipe(
      map(([SCHEMA, modelType]) => {
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
            options$: this.tableOptions$,
            dataSource: this.modelService.origiDataSource()?.options.key,
            modelType: this.modelService.modelType()
          },
          className: 'my-4'
        },
        Tables(COMMON, this.tables$)
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
