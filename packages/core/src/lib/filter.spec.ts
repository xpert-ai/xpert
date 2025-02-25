import { putFilter } from './filter'
import { ISlicer } from './types'

describe('Slicers', () => {
  it('putFilter', () => {
    let filters = []
    filters = putFilter(filters, {
      dimension: {
        dimension: 'Department'
      }
    })

    expect(filters).toEqual([
      {
        dimension: {
          dimension: 'Department'
        }
      }
    ])
  })

  it('putFilter with parameters', () => {
    let filters: ISlicer[] = [
      {
        dimension: {
          dimension: 'Department',
          parameter: 'variable1'
        },
        members: [
          {
            key: 'dep1'
          }
        ]
      }
    ]

    filters = putFilter(filters, {
      dimension: {
        dimension: 'Department',
        parameter: 'variable2'
      },
      members: [
        {
          key: 'dep2'
        }
      ]
    })

    expect(filters).toEqual([
      {
        dimension: {
          dimension: 'Department',
          parameter: 'variable1'
        },
        members: [
          {
            key: 'dep1'
          }
        ]
      },
      {
        dimension: {
          dimension: 'Department',
          parameter: 'variable2'
        },
        members: [
          {
            key: 'dep2'
          }
        ]
      }
    ])
  })
})
