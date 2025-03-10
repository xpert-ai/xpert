import { Semantics } from '../annotations'
import { ENTITY_TYPE_SALESORDER } from '../mock'
import { FilterOperator } from '../types'
import { AggregationRole } from './property'
import { EntityType } from './sdl'
import { reformat, TimeGranularity, TimeRangesSlicer, TimeRangeType, workOutTimeRangeSlicers } from './time'


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
  
  it('#reformat date string', () => {
    const result = reformat(new Date(), '202001', TimeGranularity.Month, 'yyyy-MM')
    expect(result).toBe('2020-01')

    expect(reformat(new Date(), '202001', TimeGranularity.Month, 'yyyy-MM-dd')).toBe('2020-01-01')
    expect(reformat(new Date(), '2020Q1', TimeGranularity.Quarter, 'yyyy-MM-dd')).toBe('2020-01-01')
    // expect(reformat(new Date(), '20201', TimeGranularity.Week, 'yyyy-MM-dd')).toBe('2020-01-01')
    expect(reformat(new Date(), '20200102', TimeGranularity.Day, 'yyyy-MM-dd')).toBe('2020-01-02')

    try {
      expect(reformat(new Date(), '202001', TimeGranularity.Day, 'yyyy-MM-dd')).toBe('2020-01-02')
    } catch(err) {
      expect(err)
    }
  })

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

  it('#Time slicer with start-end', () => {
    const timeRange: TimeRangesSlicer = {
      dimension: {
        dimension: 'Time'
      },
      currentDate: 'TODAY',
      ranges: [
        {
          type: TimeRangeType.Standard,
          granularity: TimeGranularity.Month,
          start: '202201',
          end: '202302',
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
    ).toEqual([
      { 
        dimension: { dimension: 'Time' }, 
        members: [
          { key: '2022.01', value: '2022.01' },
          { key: '2023.02', value: '2023.02' }
        ],
        operator: FilterOperator.BT
      }])
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
