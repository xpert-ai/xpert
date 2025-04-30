import { ChartMeasure } from '../../annotations'
import { AggregationRole, EntityType } from '../../models'
import { Dimension } from '../../types'
import { tryFixDimension } from './common'

const entityType: EntityType = {
  name: 'Sales',
  properties: {
    'Sales Amount': {
      name: 'Sales Amount',
      role: AggregationRole.measure
    }
  }
}

describe('tryFixDimension', () => {
  it('should return the correct dimension when entityType is provided', () => {
    const measure: ChartMeasure = {
      dimension: 'Measures',
      measure: '[Sales Amount]'
    }

    const result = tryFixDimension(measure, entityType)

    expect(result).toEqual({
      dimension: 'Measures',
      measure: 'Sales Amount',
      zeroSuppression: true
    })

    const measure2: ChartMeasure = {
      dimension: 'Measures',
      measure: '[Measures].[Sales Amount]'
    }

    const result2 = tryFixDimension(measure2, entityType)

    expect(result2).toEqual({
      dimension: 'Measures',
      measure: 'Sales Amount',
      zeroSuppression: true
    })

    const measure3: ChartMeasure = {
      measure: '[Measures].[Sales Amount]'
    }

    const result3 = tryFixDimension(measure3, entityType)

    expect(result3).toEqual({
      dimension: 'Measures',
      measure: 'Sales Amount',
      zeroSuppression: true
    })
  })

  it('should throw an error when property is not found', () => {
    const entityType: EntityType = {
      name: 'Sales',
      properties: {}
    }

    const dimension: Dimension = {
      dimension: 'NonExistent'
    }

    expect(() => tryFixDimension(dimension, entityType)).toThrowError("Can't find property for 'NonExistent'")
  })
})
