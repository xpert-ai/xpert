import {
  AggregationOperation,
  AggregationProperty,
  AggregationRole,
  CalculatedProperty,
  CalculationProperty,
  CalculationType,
  CompareToEnum,
  C_MEASURES,
  Dimension,
  MeasureControlProperty,
  ParameterControlEnum,
  ParameterProperty,
  RestrictedMeasureProperty,
  VarianceMeasureProperty
} from '@xpert-ai/ocap-core'
import { DEPARTMENT_CUBE, DEPARTMENT_ENTITY_TYPE } from '../test/DATA'
import {
  addCalculatedMember,
  calculationPropertyToFormula,
  serializeAggregationProperty,
  serializeMemberSet,
  serializeRestrictedMeasureProperty,
  serializeVarianceMeasureProperty,
  withCalculationMembers
} from './calculation'


describe('Calculation Members', () => {
  it('#addCalculatedMember', () => {
    const calculatedMembers = {
      '[Measures].[B]': {
        name: 'B',
        formula: `[Measures].[sales]`
      }
    }
    expect(
      addCalculatedMember(
        `[Measures].[A] + [Measures].[B]`,
        calculatedMembers,
        [
          {
            name: 'A',
            role: AggregationRole.measure,
            calculationType: CalculationType.Calculated,
            formula: `[Measures].[sales]`
          } as CalculatedProperty
        ],
        [],
        []
      )
    )
    .toEqual(`[Measures].[A] + [Measures].[B]`)

    expect(calculatedMembers).toEqual({
      '[Measures].[B]': {
        name: 'B',
        formula: `[Measures].[sales]`
      },
      '[Measures].[A]': {
        name: 'A',
        dimension: C_MEASURES,
        formula: `[Measures].[sales]`
      }
    })
  })

  it('#addCalculatedMember with parameters', () => {
    const calculatedMembers = {}

    expect(
      addCalculatedMember(
        `[@A] + [Measures].[B]`,
        calculatedMembers,
        [
          {
            name: 'B',
            role: AggregationRole.measure,
            calculationType: CalculationType.Calculated,
            formula: `[Measures].[sales]`
          } as CalculatedProperty
        ],
        [
          {
            name: 'A',
            paramType: ParameterControlEnum.Input,
            value: 5
          } as ParameterProperty
        ],
        []
      )
    )
    .toEqual(`5 + [Measures].[B]`)

    expect(calculatedMembers).toEqual({
      '[Measures].[B]': {
        name: 'B',
        dimension: C_MEASURES,
        formula: `[Measures].[sales]`
      }
    })
  })

  it('#Basic with calculation dimension member', () => {
    const members = withCalculationMembers(
      {},
      [
        {
          hierarchy: '[Department]',
          members: ['C']
        }
      ],
      DEPARTMENT_CUBE,
      DEPARTMENT_ENTITY_TYPE,
      []
    )

    expect(members).toEqual({
      '[Department].[C]': {
        dimension: '[Department]',
        hierarchy: '[Department]',
        name: 'C',
        formula: '[Department].[A] + [Department].[B]'
      }
    })
  })

  it('#with Filter Members', () => {
    const members = withCalculationMembers({}, [], DEPARTMENT_CUBE, DEPARTMENT_ENTITY_TYPE, [
      {
        hierarchy: '[Department]',
        members: ['C']
      }
    ])
    expect(members).toEqual({
      '[Department].[C]': {
        dimension: '[Department]',
        hierarchy: '[Department]',
        name: 'C',
        formula: '[Department].[A] + [Department].[B]'
      }
    })
  })

  it('#Calculated Member from another calculated Member', () => {
    const members = withCalculationMembers(
      {},
      [
        {
          hierarchy: '[Department]',
          members: ['D']
        }
      ],
      DEPARTMENT_CUBE,
      DEPARTMENT_ENTITY_TYPE,
      []
    )
    expect(members).toEqual({
      '[Department].[D]': {
        dimension: '[Department]',
        hierarchy: '[Department]',
        name: 'D',
        formula: '[Department].[A] + [Department].[C]'
      }
    })

    expect(
      withCalculationMembers(
        {},
        [
          {
            dimension: C_MEASURES,
            members: ['Department CustomerCount']
          }
        ],
        DEPARTMENT_CUBE,
        {
          ...DEPARTMENT_ENTITY_TYPE,
          properties: {
            ...DEPARTMENT_ENTITY_TYPE.properties,
            CustomerCount: {
              name: 'CustomerCount',
              role: AggregationRole.measure,
              calculationType: CalculationType.Aggregation,
              operation: AggregationOperation.COUNT,
              aggregationDimensions: [
                {
                  dimension: '[Customers]',
                  hierarchy: '[Customers]',
                  level: '[Customers].[Customer Name]'
                }
              ]
            },
            'Department CustomerCount': {
              name: 'Department CustomerCount',
              calculationType: CalculationType.Restricted,
              measure: 'CustomerCount',
              dimensions: [
                {
                  dimension: '[Department]',
                  members: [
                    {
                      value: 'D_1'
                    }
                  ]
                }
              ]
            }
          }
        },
        []
      )
    ).toEqual({
      '[Measures].[CustomerCount]': {
        dimension: 'Measures',
        formula: 'Count( Distinct( [Customers].[Customer Name].Members ), EXCLUDEEMPTY )',
        name: 'CustomerCount'
      },
      '[Measures].[Department CustomerCount]': {
        dimension: 'Measures',
        formula: 'Aggregate( {[Department].[D_1]}, [Measures].[CustomerCount] )',
        name: 'Department CustomerCount'
      }
    })
  })

  it('#serializeAggregationProperty', () => {
    const property: AggregationProperty = {
      name: 'DepartmentCount',
      calculationType: CalculationType.Aggregation,
      operation: AggregationOperation.COUNT,
      aggregationDimensions: [
        {
          dimension: '[Customers]',
          hierarchy: '[Customers]',
          level: '[Customers].[Customer Name]'
        }
      ]
    }

    expect(
      serializeAggregationProperty({
        ...property,
        measure: 'ZAMOUNT'
      })
    ).toEqual(`Count( Distinct( [Customers].[Customer Name].Members * [Measures].[ZAMOUNT] ), EXCLUDEEMPTY )`)

    expect(serializeAggregationProperty(property)).toEqual(
      `Count( Distinct( [Customers].[Customer Name].Members ), EXCLUDEEMPTY )`
    )

    expect(
      serializeAggregationProperty({
        ...property,
        operation: AggregationOperation.SUM,
        measure: 'ZAMOUNT'
      })
    ).toEqual(`Sum( [Customers].[Customer Name].Members, [Measures].[ZAMOUNT] )`)

    expect(
      serializeAggregationProperty({
        ...property,
        operation: AggregationOperation.MIN,
        measure: 'ZAMOUNT'
      })
    ).toEqual(`Min( [Customers].[Customer Name].Members, [Measures].[ZAMOUNT] )`)

    expect(
      serializeAggregationProperty({
        ...property,
        operation: AggregationOperation.MAX,
        measure: 'ZAMOUNT'
      })
    ).toEqual(`Max( [Customers].[Customer Name].Members, [Measures].[ZAMOUNT] )`)

    expect(
      serializeAggregationProperty({
        ...property,
        operation: AggregationOperation.TOP_PERCENT,
        measure: 'ZAMOUNT',
        value: 10
      })
    ).toEqual(`Aggregate( TopPercent( [Customers].[Customer Name].Members, 10, [Measures].[ZAMOUNT] ) )`)
  })
})

describe('Serialize Restricted Measure Property', () => {
  it('#serializeRestrictedMeasureProperty', () => {
    const property: RestrictedMeasureProperty = {
      name: 'Department CustomerCount',
      calculationType: CalculationType.Restricted,
      measure: 'CustomerCount',
      dimensions: [
        {
          dimension: '[Department]',
          members: [
            {
              value: 'D_1'
            }
          ]
        }
      ],
      slicers: []
    }

    expect(
      serializeRestrictedMeasureProperty(
        {
          ...property
        },
        []
      )
    ).toEqual(`Aggregate( {[Department].[D_1]}, [Measures].[CustomerCount] )`)

    expect(
      serializeRestrictedMeasureProperty(
        {
          ...property,
          constantDimensions: [
            {
              dimension: '[Department]',
              members: [
                {
                  value: 'D_1'
                }
              ]
            }
          ]
        },
        []
      )
    ).toEqual(`Aggregate( {[Department].[D_1]}, [Measures].[CustomerCount] )`)
  })

  it('#Dimension with Parameter', () => {
    const property: RestrictedMeasureProperty = {
      name: 'Department Sales',
      calculationType: CalculationType.Restricted,
      measure: 'Sales',
      dimensions: [
        {
          dimension: 'Customer',
          parameter: 'Customer_Selector'
        }
      ],
      slicers: []
    }

    expect(
      serializeRestrictedMeasureProperty(
        {
          ...property
        },
        []
      )
    ).toEqual(`Aggregate( [@Customer_Selector], [Measures].[Sales] )`)

    expect(
      serializeRestrictedMeasureProperty(
        {
          ...property,
          constantDimensions: [
            {
              dimension: '[Department]',
              members: [
                {
                  value: 'D_1'
                }
              ]
            }
          ]
        },
        []
      )
    ).toEqual(`Aggregate( [@Customer_Selector], [Measures].[Sales] )`)
  })
})

describe('Serialize MemberSet', () => {
  it('Basic', () => {
    const dimension: Dimension = {
      dimension: '[Time]'
    }
    expect(serializeMemberSet(dimension)).toEqual(`[Time].Members`)
  })

  it('With parameter', () => {
    const dimension: Dimension = {
      dimension: '[Time]',
      parameter: 'Time_param'
    }
    expect(serializeMemberSet(dimension)).toEqual(`[@Time_param]`)
  })

  it('With members', () => {
    const dimension: Dimension = {
      dimension: '[Time]',
      members: [
        {
          value: '2020'
        },
        {
          value: '2021'
        }
      ]
    }
    expect(serializeMemberSet(dimension)).toEqual(`{[Time].[2020], [Time].[2021]}`)
  })
})

describe('Measure Control', () => {
  // property: CalculationProperty, slicers?: MDXHierarchyFilter[]

  it('Measure Select', () => {
    const property: CalculationProperty = {
      name: 'MS',
      role: AggregationRole.measure,
      calculationType: CalculationType.MeasureControl,
      value: 'M1'
    } as MeasureControlProperty

    // slicers?: MDXHierarchyFilter[]

    expect(calculationPropertyToFormula(property)).toEqual(`[Measures].[M1]`)
  })

  it('With Calculation Members', () => {
    const dimensions = [
      {
        dimension: 'Time'
      },
      {
        dimension: C_MEASURES,
        members: [{ value: 'MS' }]
      }
    ]
    const entityType = {
      name: 'Sales',
      properties: {
        Time: {
          name: 'Time',
          role: AggregationRole.dimension
        },
        MS: {
          name: 'MS',
          role: AggregationRole.measure,
          calculationType: CalculationType.MeasureControl,
          availableMembers: [],
          value: 'M1'
        },
        M1: {
          name: 'M1',
          role: AggregationRole.measure,
          calculationType: CalculationType.Indicator,
          measure: 'sales'
        },
        M2: {
          name: 'M2',
          role: AggregationRole.measure,
          calculationType: CalculationType.Indicator
        },
        sales: {
          name: 'sales',
          role: AggregationRole.measure
        }
      }
    }

    expect(withCalculationMembers({}, dimensions, null, entityType)).toEqual({
      '[Measures].[M1]': { dimension: 'Measures', formula: '[Measures].[sales]', name: 'M1' },
      '[Measures].[MS]': { dimension: 'Measures', formula: '[Measures].[M1]', name: 'MS' }
    })
  })
})

describe('Serialize Variance Measure Property', () => {
  it('#difference', () => {
    const property: VarianceMeasureProperty = {
      name: 'Profit YOY',
      calculationType: CalculationType.Variance,
      measure: {
        dimension: C_MEASURES,
        measure: 'Profit'
      },
      baseDimension: {
        dimension: '[Time]'
      },
      compareA: {
        type: CompareToEnum.CurrentMember
      },
      toB: {
        type: CompareToEnum.Lag,
        value: `12`
      }
    }

    expect(
      serializeVarianceMeasureProperty({
        ...property
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - ([Time].CurrentMember.Lag(12), [Measures].[Profit]) )`
    )

    expect(
      serializeVarianceMeasureProperty({
        ...property,
        asPercentage: true,
        divideBy: 'A'
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - ([Time].CurrentMember.Lag(12), [Measures].[Profit]) ) / CoalesceEmpty( Aggregate( [Time].CurrentMember, [Measures].[Profit] ), ([Time].CurrentMember.Lag(12), [Measures].[Profit]) )`
    )

    expect(
      serializeVarianceMeasureProperty({
        ...property,
        toB: {
          ...property.toB,
          type: CompareToEnum.SelectedMember,
          value: '2020'
          // SelectedMember 也只支持一个成员值
          // slicer: {
          //   dimension: {
          //     dimension: '[Time]',
          //     hierarchy: '[Time]'
          //   },
          //   members: [
          //     {
          //       value: '2020'
          //     }
          //   ]
          // }
        }
      })
    ).toEqual(`( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - ([Time].[2020], [Measures].[Profit]) )`)
  })

  it('#MoM', () => {
    const property: VarianceMeasureProperty = {
      name: 'Sales MOM',
      measure: {
        dimension: 'Measures',
        measure: 'Profit'
      },
      baseDimension: {
        dimension: '[Time]',
        hierarchy: '[Time]',
        level: '[Time].[Month]'
      },
      compareA: {
        type: CompareToEnum.CurrentMember
        // slicer: {
        //   members: [
        //     {
        //       value: '[2021]',
        //       label: '2021'
        //     }
        //   ],
        //   dimension: {
        //     name: null,
        //     dimension: '[Time]',
        //     hierarchy: '[Time]',
        //     level: '[Time].[Month]',
        //   }
        // },
      },
      toB: {
        type: CompareToEnum.Lag,
        value: 1
      },
      asZero: null,
      asPercentage: true,
      absBaseValue: true,
      divideBy: 'B',
      calculationType: CalculationType.Variance,
      role: AggregationRole.measure,
      dataType: 'number'
    }

    expect(
      serializeVarianceMeasureProperty({
        ...property
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - ([Time].CurrentMember.Lag(1), [Measures].[Profit]) ) / Abs( CoalesceEmpty( ([Time].CurrentMember.Lag(1), [Measures].[Profit]), Aggregate( [Time].CurrentMember, [Measures].[Profit] ) ) )`
    )
  })

  it('#YoY', () => {
    const property: VarianceMeasureProperty = {
      name: 'Sales YoY',
      measure: {
        dimension: 'Measures',
        measure: 'Profit'
      },
      baseDimension: {
        dimension: '[Time]',
        hierarchy: '[Time]',
        level: '[Time].[Year]'
      },
      compareA: {
        type: CompareToEnum.CurrentMember
      },
      toB: {
        type: CompareToEnum.Parallel,
        value: 1
      },
      asZero: null,
      asPercentage: true,
      absBaseValue: true,
      divideBy: 'B',
      calculationType: CalculationType.Variance,
      role: AggregationRole.measure,
      dataType: 'number'
    }

    expect(
      serializeVarianceMeasureProperty({
        ...property
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[Profit]) ) / Abs( CoalesceEmpty( (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[Profit]), Aggregate( [Time].CurrentMember, [Measures].[Profit] ) ) )`
    )

    expect(
      serializeVarianceMeasureProperty({
        ...property,
        absBaseValue: false
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[Profit]) ) / CoalesceEmpty( (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[Profit]), Aggregate( [Time].CurrentMember, [Measures].[Profit] ) )`
    )

    expect(
      serializeVarianceMeasureProperty({
        ...property,
        asPercentage: false
      })
    ).toEqual(
      `( Aggregate( [Time].CurrentMember, [Measures].[Profit] ) - (ParallelPeriod( [Time].[Year], 1, [Time].CurrentMember ), [Measures].[Profit]) )`
    )
  })
})
