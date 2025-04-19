import { Injectable } from '@angular/core'
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
  readonly sharedDimensions$ = this.modelService.sharedDimensions$

  public readonly cube$ = this.select((state) => state.cube)
  public readonly cubeName$ = this.cube$.pipe(map((cube) => cube?.name))
  public readonly factName$ = this.cube$.pipe(map((cube) => cube?.tables?.[0]?.name))

  public readonly measures$ = this.cube$.pipe(
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

  public readonly fields$ = this.cubeName$.pipe(
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
   * 原始 Fact 数据表字段
   */
  public readonly factFields$ = this.factName$.pipe(
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

  public readonly cube = toSignal(this.cube$)

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
