import { AdvancedSlicerOperator, C_MEASURES, Dimension } from '@xpert-ai/ocap-core'
import { DEPARTMENT_ENTITY_TYPE } from '../test/DATA'
import { OrderFlag } from './functions'
import { generateMDXQuery } from './mdx-query'
import { generateAxisStatement, generateMDXStatement, serializeOrderRank, serializeOrder } from './mdx-statement'
import { MDXRank } from './types'


describe('Generate MDX Statement', () => {
  it('#generateMDXStatement', () => {
    expect(
      generateMDXStatement(
        generateMDXQuery('HR', DEPARTMENT_ENTITY_TYPE, { selects: [{ dimension: '[Department]' }] }),
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {} ON COLUMNS,
{[Department].[All Departments]}
ON ROWS
FROM [HR]`) // {Except([Department].Children, {[Department].[#]})}

    expect(
      generateMDXStatement(
        generateMDXQuery('HR', DEPARTMENT_ENTITY_TYPE, {
          selects: [
            {
              dimension: '[Department]',
              level: '[Department].[(All)]'
            },
            {
              dimension: C_MEASURES,
              measure: 'ZAMOUNT'
            } as Dimension
          ],
          filters: [
            // {
            //   dimension: {
            //     dimension: '[Department]',
            //     level:
            //   },
            //   operator: NxFilterOperator.EQ,
            //   members: [{
            //     value: '0'
            //   }],
            //   and: true
            // }
          ]
        }),
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {[Measures].[ZAMOUNT]} ON COLUMNS,
{[Department].[(All)].Members}
ON ROWS
FROM [HR]`) // {Except([Department].[(All)].Members, {[Department].[#]})}
  })

  it('#generate MDXQuery Statement', () => {
    expect(
      generateMDXStatement(
        {
          entity: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit']
            }
          ],
          rows: [
            {
              hierarchy: '[Department]',
              properties: ['PARENT_UNIQUE_NAME'],
              statement: '[Department]'
            }
          ],
          slicers: [
            {
              dimension: '[Store]',
              hierarchy: '[Store]',
              members: ['[A]']
            }
          ],
          members: [
            {
              dimension: 'Measures',
              name: 'myset',
              Formula: ['xxxxxx']
            }
          ]
        } as any,
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`WITH
MEMBER [Measures].[myset] AS xxxxxx
SELECT
non empty {[Measures].[Profit]} ON COLUMNS,
{[Department]}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]
WHERE ({{[Store].[A]}})`)

    expect(
      generateMDXStatement(
        {
          cube: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit']
            }
          ],
          rows: [
            {
              dimension: '[Department]',
              hierarchy: '[Department]',
              properties: ['PARENT_UNIQUE_NAME'],
              order: OrderFlag.DESC,
              statement: 'Order({[Department]}, [Department].CurrentMember.Ordinal, BDESC)'
            }
          ],
          slicers: [
            {
              dimension: '[Store]',
              hierarchy: '[Store]',
              members: ['[A]']
            }
          ],
          members: [
            {
              dimension: 'Measures',
              name: 'myset',
              Formula: ['xxxxxx']
            }
          ]
        } as any,
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`WITH 
MEMBER [Measures].[myset] AS xxxxxx
SELECT
non empty {[Measures].[Profit]} ON COLUMNS,
{Order({[Department]}, [Department].CurrentMember.Ordinal, BDESC)}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]
WHERE ({[Store].[A]})`)
  })

  it('#generate MDX Query statement with Conditions', () => {
    expect(
      generateMDXStatement(
        {
          entity: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit']
            }
          ],
          rows: [
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
          ],
          conditions: [
            {
              context: [
                {
                  dimension: '[Department]',
                  hierarchy: '[Department]'
                }
              ],
              // path: [
              //   {
              //     dimension: '[Customers]',
              //     hierarchy: '[Customers]'
              //   }
              // ],
              operator: AdvancedSlicerOperator.TopCount,
              value: ['10'],
              measure: 'ZAMOUNT'
            }
          ]
        },
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {[Measures].[Profit]} ON COLUMNS,
Generate( [Customers].Members, TopCount( NonEmptyCrossjoin( [Customers].CurrentMember, {[Department]} ), 10, [Measures].[ZAMOUNT] ) )*{[Customers].Members}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]`)
  })

  it('#generateAxisStatement', () => {
    expect(
      generateAxisStatement(
        [
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
          },
          {
            dimension: C_MEASURES, // 'Measures',
            members: ['Profit', 'GrossAmount']
          },
          {
            dimension: '[ZCALMONTH]',
            hierarchy: '[ZCALMONTH]',
            statement: '[ZCALMONTH].Children',
            properties: ['PARENT_UNIQUE_NAME']
          }
        ],
        [
          {
            context: [
              {
                dimension: '[Customers]',
                hierarchy: '[Customers]'
              }
            ],
            operator: AdvancedSlicerOperator.TopCount,
            value: ['10'],
            measure: 'ZAMOUNT'
          }
        ]
      )
    ).toEqual({
      statement: `Generate( {[Department]} * {[ZCALMONTH].Children}, TopCount( NonEmptyCrossjoin( [Department].CurrentMember, [ZCALMONTH].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] ) )*{[Measures].[Profit], [Measures].[GrossAmount]}*{[ZCALMONTH].Children}`,
      members: [],
      zeroSuppression: false
    })
  })

  it('#generateAxisStatement With Advanced Slicer has other', () => {
    const result = generateAxisStatement(
      [
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
        },
        {
          dimension: C_MEASURES, // 'Measures',
          members: ['Profit', 'GrossAmount']
        },
        {
          dimension: '[ZCALMONTH]',
          hierarchy: '[ZCALMONTH]',
          statement: '[ZCALMONTH].Children',
          properties: ['PARENT_UNIQUE_NAME']
        }
      ],
      [
        {
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
      ]
    )
    expect(result.statement).toEqual(`Generate( {[Department]} * {[ZCALMONTH].Children}, TopCount( NonEmptyCrossjoin( [Department].CurrentMember, [ZCALMONTH].CurrentMember, {[Customers].Members} ), 10, [Measures].[ZAMOUNT] ) )*{[Measures].[Profit], [Measures].[GrossAmount]}*{[ZCALMONTH].Children}`)
  })

  it('#generate MDX statement with rows and columns', () => {
    expect(
      generateMDXStatement(
        {
          entity: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit', 'GrossAmount']
            },
            {
              dimension: '[ZCALMONTH]',
              hierarchy: '[ZCALMONTH]',
              statement: '[ZCALMONTH].Children',
              properties: ['PARENT_UNIQUE_NAME']
            }
          ],
          rows: [
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
        },
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {[Measures].[Profit], [Measures].[GrossAmount]}*{[ZCALMONTH].Children}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME ON COLUMNS,
{[Department]}*{[Customers].Members}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]`)
  })

})


describe('Generate Order Rank Statement', () => {
  let statement = ''
  let orderbys = []
  beforeEach(() => {
    statement = `{[Time].[Quarter].Members}`
    orderbys = [
      {
        dimension: C_MEASURES,
        members: [
          { value: 'Sales'}
        ],
        order: OrderFlag.BASC
      }
    ]
  })

  it('#serializeOrder', () => {
    expect(serializeOrder(statement, orderbys))
      .toEqual(`TopCount( Order( {[Time].[Quarter].Members}, [Measures].[Sales], BASC ), 5 )`)
  })

  it('#serializeOrderRank', () => {
    expect(serializeOrderRank({statement}, orderbys, [MDXRank.Top, 5], 'Sales'))
      .toEqual(`TopCount( Order( {[Time].[Quarter].Members}, [Measures].[Sales], BASC ), 5 )`)
  })

  it('#RankOrder', () => {
    expect(
      generateMDXStatement(
        {
          entity: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit', 'GrossAmount']
            },
            {
              dimension: '[ZCALMONTH]',
              hierarchy: '[ZCALMONTH]',
              statement: '[ZCALMONTH].Children',
              properties: ['PARENT_UNIQUE_NAME']
            }
          ],
          rows: [
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
          ],
          rank: [MDXRank.Top, 5],
          orderbys: [
            {
              dimension: '[Department]',
              hierarchy: '[Department]',
              order: OrderFlag.DESC
            }
          ]
        },
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {[Measures].[Profit], [Measures].[GrossAmount]}*{[ZCALMONTH].Children}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME ON COLUMNS,
TopCount( Order( {[Department]}*{[Customers].Members}, [Department].CurrentMember.Ordinal, BDESC ), 5 )
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]`)
  })

  it('#Dimension Properties and Orderby', () => {
    expect(
      generateMDXStatement(
        {
          entity: 'HR',
          columns: [
            {
              dimension: 'Measures',
              members: ['Profit', 'GrossAmount']
            },
            {
              dimension: '[ZCALMONTH]',
              hierarchy: '[ZCALMONTH]',
              statement: '[ZCALMONTH].Children',
              properties: ['PARENT_UNIQUE_NAME']
            }
          ],
          rows: [
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
          ],
          rank: [MDXRank.Top, 5],
          orderbys: [
            {
              dimension: '[Department]',
              hierarchy: '[Department]',
              order: OrderFlag.DESC
            }
          ]
        },
        DEPARTMENT_ENTITY_TYPE
      )
    ).toEqual(`SELECT
non empty {[Measures].[Profit], [Measures].[GrossAmount]}*{[ZCALMONTH].Children}
DIMENSION PROPERTIES PARENT_UNIQUE_NAME ON COLUMNS,
TopCount( Order( {[Department]}*{[Customers].Members}, [Department].CurrentMember.Ordinal, BDESC ), 5 )
DIMENSION PROPERTIES PARENT_UNIQUE_NAME
ON ROWS
FROM [HR]`)
  })
})
