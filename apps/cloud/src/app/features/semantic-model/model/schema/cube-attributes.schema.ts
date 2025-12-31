import { Injectable } from '@angular/core'
import { Cube } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/story/designer'
import { catchError, filter, map, switchMap } from 'rxjs'
import { of } from 'rxjs'
import { EntitySchemaService } from './entity-schema.service'
import { CubeSchemaState } from './types'

@Injectable()
export class CubeAttributesSchema<T = Cube> extends EntitySchemaService<CubeSchemaState<T>> {
  public readonly cube$ = this.select((state) => state.cube)
  public readonly cubeName$ = this.cube$.pipe(map((cube) => cube?.name))
  public readonly factName$ = this.cube$.pipe(
    map((cube) => {
      // Get actual table name from cube configuration
      // Priority: cube.tables[0].name > cube.fact.table.name > cube.fact.table
      if (cube?.tables && cube.tables.length > 0 && cube.tables[0]?.name) {
        return cube.tables[0].name
      }
      if (cube?.fact?.table) {
        return typeof cube.fact.table === 'string' ? cube.fact.table : cube.fact.table.name
      }
      return null
    })
  )

  /**
   * Get fields from the fact table (not cube name)
   * Uses the actual table name from cube configuration
   */
  public readonly fields$ = this.factName$.pipe(
    filter((name) => !!name),
    switchMap((table) => this.modelService.selectOriginalEntityProperties(table).pipe(
      catchError((error) => {
        console.warn(`[CubeAttributesSchema] Error loading fields for table "${table}":`, error)
        return of([])
      })
    )),
    map((properties) => [
      { value: null, label: 'None' },
      ...properties.map((property) => ({ value: property.name, label: property.caption }))
    ])
  )

  /**
   * 原始 Fact 数据表字段
   */
  public readonly factFields$ = this.factName$.pipe(
    filter((name) => !!name),
    switchMap((table) => this.modelService.selectOriginalEntityProperties(table).pipe(
      catchError((error) => {
        console.warn(`[CubeAttributesSchema] Error loading factFields for table "${table}":`, error)
        return of([])
      })
    )),
    map((properties) => [
      { value: null, label: 'None' },
      ...properties.map((property) => ({ value: property.name, label: property.caption }))
    ])
  )

  SCHEMA: any

  getSchema() {
    return this.translate.stream('PAC.MODEL.SCHEMA').pipe(
      map((SCHEMA) => {
        this.SCHEMA = SCHEMA

        return [
          {
            type: 'tabs',
            fieldGroup: [
              this.builder,
              // this.dataDistribution
            ]
          }
        ]
      })
    )
  }

  get builder(): any {
    const CUBE = this.SCHEMA?.CUBE
    return {
      props: {
        label: CUBE?.TITLE ?? 'Cube',
        icon: 'crop_free'
      },
      fieldGroup: [this.cubeModeling]
    }
  }

  get cubeModeling() {
    const COMMON = this.SCHEMA?.COMMON
    const CUBE = this.SCHEMA?.CUBE

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
              className: FORMLY_W_1_2,
              props: {
                label: CUBE?.Name ?? 'Name',
                readonly: true
              }
            },
            {
              key: 'caption',
              type: 'input',
              className: FORMLY_W_1_2,
              props: {
                label: COMMON?.Caption ?? 'Caption'
              }
            },
            {
              key: 'description',
              type: 'textarea',
              className: FORMLY_W_FULL,
              props: {
                label: COMMON?.Description ?? 'Description',
              }
            },
            {
              className: FORMLY_W_1_2,
              key: 'visible',
              type:'checkbox',
              props: {
                label: COMMON?.Visible ?? 'Visible',
              }
            },
          ]
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
}
