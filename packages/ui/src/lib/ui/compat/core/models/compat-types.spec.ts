import { DisplayBehaviour, OffSetDirection, TimeGranularity, TimeRangeType } from './compat-types'

describe('UI compatibility types', () => {
  it('keeps the persisted display behaviour values stable', () => {
    expect(DisplayBehaviour).toEqual({
      descriptionAndId: 'descriptionAndId',
      descriptionOnly: 'descriptionOnly',
      idAndDescription: 'idAndDescription',
      idOnly: 'idOnly',
      auto: ''
    })
  })

  it('keeps the persisted time filter values stable', () => {
    expect(TimeGranularity).toEqual({
      Year: 'Year',
      Quarter: 'Quarter',
      Month: 'Month',
      Week: 'Week',
      Day: 'Day'
    })
    expect(TimeRangeType).toEqual({
      Standard: 'Standard',
      Offset: 'Offset'
    })
    expect(OffSetDirection).toEqual({
      LookBack: 'LookBack',
      LookAhead: 'LookAhead'
    })
  })
})
