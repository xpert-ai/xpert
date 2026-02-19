import { C_MEASURES } from '@metad/ocap-core'
import { referenceLines } from './series'
import { AxisEnum } from '../types'

describe('Reference Lines', () => {
  it('#Basic', () => {
    expect(
      referenceLines(
        {
          dimension: C_MEASURES,
          measure: 'sales',
          referenceLines: []
        },
        null,
        null,
        AxisEnum.x
      )
    ).toEqual(``)
  })
})
