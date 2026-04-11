import { AggregationRole, CalculationType, getEntityHierarchy } from '@xpert-ai/ocap-core'
import { ENTITY_TYPE_SALESORDER } from '../../test/mock-data'
import { YOY } from './calendar'

describe('YOY', () => {
  it('should return YOY property', () => {
    expect(YOY('revenue', getEntityHierarchy(ENTITY_TYPE_SALESORDER, { hierarchy: '[Time]' }))).toEqual({
      name: 'revenue-YOY',
      role: AggregationRole.measure,
      calculationType: CalculationType.Calculated,
      dataType: 'number',
      formula:
        '([Measures].[revenue] - CoalesceEmpty( (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[revenue]), [Measures].[revenue] )) / CoalesceEmpty( (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[revenue]), [Measures].[revenue] )'
    })
  })

  
})
