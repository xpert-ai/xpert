import { Semantics } from '../annotations'
import { ENTITY_TYPE_SALESORDER } from '../mock'
import { AggregationRole } from './property'
import { EntityType } from './sdl'
import { TimeGranularity, TimeRangesSlicer, TimeRangeType, workOutTimeRangeSlicers } from './time'


const entityType: EntityType = {
  name: 'Sales',
  properties: {
    Time: {
      name: 'Time',
      role: AggregationRole.dimension,
      semantics: {
        semantic: Semantics.Calendar
      }
    }
  }
}

describe('Time Range slicers', () => {
  it('#WorkOutTimeRangeSlicers Basic', () => {
    const timeRange: TimeRangesSlicer = {
      dimension: {
        dimension: '[Time]'
      },
      currentDate: 'TODAY',
      ranges: [
        {
          type: TimeRangeType.Standard,
          granularity: TimeGranularity.Month
        }
      ]
    }

    expect(
      workOutTimeRangeSlicers(
        new Date('2022-05-01'),
        timeRange,
        ENTITY_TYPE_SALESORDER
      )
    ).toEqual([{
      dimension: {
        dimension: '[Time]'
      },
      members: [
        { key: '202205', "value": "202205" }
      ]
    }])
  })

  it('#WorkOutTimeRangeSlicers with Formatter', () => {
    const timeRange: TimeRangesSlicer = {
      dimension: {
        dimension: 'Time'
      },
      currentDate: 'TODAY',
      ranges: [
        {
          type: TimeRangeType.Standard,
          granularity: TimeGranularity.Month,
          formatter: `yyyy.MM`
        }
      ]
    }

    expect(
      workOutTimeRangeSlicers(
        new Date('2022-05-01'),
        timeRange,
        entityType
      )
    ).toEqual([{ dimension: { dimension: 'Time' }, members: [{ key: '2022.05', value: '2022.05' }] }])
  })

  it('#WorkOutTimeRangeSlicers with Semantics', () => {
    const timeRange: TimeRangesSlicer = {
      dimension: {
        dimension: 'Time'
      },
      currentDate: 'TODAY',
      ranges: [
        {
          type: TimeRangeType.Standard,
          granularity: TimeGranularity.Month
        }
      ]
    }

    expect(
      workOutTimeRangeSlicers(
        new Date('2022-05-01'),
        timeRange,
        {
          ...entityType,
          properties: {
            ...entityType.properties,
            Time: {
              ...entityType.properties['Time'],
              semantics: {
                semantic: Semantics.Calendar,
                formatter: ``
              },
              hierarchies: [
                {
                  name: '',
                  role: AggregationRole.hierarchy,
                  levels: [
                    {
                      name: 'Month',
                      role: AggregationRole.level,
                      semantics: {
                        semantic: Semantics['Calendar.Month'],
                        formatter: `[yyyy].[MM]`
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      )
    ).toEqual([{ dimension: { dimension: 'Time' }, members: [{ key: '[2022].[05]', value: '[2022].[05]' }] }])
  })
})
