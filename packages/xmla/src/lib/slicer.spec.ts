import { AdvancedSlicerOperator } from '@xpert-ai/ocap-core'
import { DEPARTMENT_CUBE, DEPARTMENT_ENTITY_TYPE } from '../test/DATA'
import { withCalculationMembers } from './calculation'
import { OrderFlag } from './functions'
import { generateSlicersStatement, generateTopCount, generateTopCountStatement, splitQueryDimensionsAB } from './slicer'

describe('Slicers', () => {
  it('#Basic', () => {
    const members = withCalculationMembers(
      {},
      [
        {
          hierarchy: '[Department]',
          members: ['C']
        }
      ],
      DEPARTMENT_CUBE,
      DEPARTMENT_ENTITY_TYPE
    )

    expect(members).toEqual({
      '[Department].[C]': {
        dimension: '[Department]',
        formula: '[Department].[A] + [Department].[B]',
        hierarchy: '[Department]',
        name: 'C'
      }
    })
  })

  it('#Generate Where Slicers Statement', () => {
    const where = generateSlicersStatement([
      {
        dimension: '[Department]',
        hierarchy: '[Department]',
        members: [
          {
            value: 'D'
          },
          {
            value: 'E'
          }
        ]
      },
      {
        dimension: '[Department]',
        hierarchy: '[Department]',
        members: [
          {
            value: 'F'
          }
        ]
      },
      {
        dimension: '[Customers]',
        hierarchy: '[Customers]',
        members: [
          {
            value: 'C'
          }
        ]
      }
    ])

    expect(where).toEqual('{{[Department].[D], [Department].[E]},{[Department].[F]}}*{{[Customers].[C]}}')
  })
})

describe('Advanced Slicer has or not Other', () => {
  const dimensions = [
    {
      dimension: '[Department]',
      hierarchy: '[Department]',
      properties: ['PARENT_UNIQUE_NAME'],
      order: OrderFlag.DESC,
      statement: '[Department]'
    },
    {
      dimension: '[Customers]',
      hierarchy: '[Customers]',
      statement: '[Customers].Members'
    }
  ]

  const condition = {
    context: [
      {
        dimension: '[Customers]',
        hierarchy: '[Customers]'
      }
    ],
    operator: AdvancedSlicerOperator.TopCount,
    value: ['10'],
    measure: 'ZAMOUNT',
    other: true
  }

  it('#splitQueryDimensionsAB', () => {
    const { A, B } = splitQueryDimensionsAB(dimensions, condition)
    expect(A).toEqual([
      {
        dimension: '[Department]',
        hierarchy: '[Department]',
        order: 'DESC',
        properties: ['PARENT_UNIQUE_NAME'],
        statement: '[Department]'
      }
    ])

    expect(B).toEqual([{ dimension: '[Customers]', hierarchy: '[Customers]', statement: '[Customers].Members' }])

    expect(generateTopCountStatement(condition, A, B)).toEqual(
      'TopCount( Crossjoin( [Department].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] )'
    )
  })

  it('#generateTopCount no other', () => {
    const result = generateTopCount(dimensions, {...condition, other: null})

    expect(result.statement).toEqual(
      'Generate( [Department], TopCount( Crossjoin( [Department].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] ) )'
    )

    expect(result.members).toEqual(undefined)
  })

  it('#generateTopCount has other', () => {
    const result = generateTopCount(dimensions, condition)

    expect(result.statement).toEqual(
      'Order( {Generate( [Department], TopCount( Crossjoin( [Department].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] ) ), Generate( [Department], Crossjoin( [Department].CurrentMember, {[Customers].[Other]} ) )}, [Department].CurrentMember.NAME )'
    )

    expect(result.members).toEqual([
      {
        hierarchy: '[Customers]',
        formula:
          'Aggregate( Except( Crossjoin( [Department].CurrentMember, {[Customers].Members} ), TopCount( Crossjoin( [Department].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] ) ) )',
        name: 'Other'
      }
    ])
  })
})
