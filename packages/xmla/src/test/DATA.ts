import { AggregationRole } from '@xpert-ai/ocap-core'
import { MDXDialect } from '../lib/types'

export const ENTITY_TYPE = {
  properties: {
    '[2CRVIDTASTORAGE].[level01]': {
      name: '[2CRVIDTASTORAGE].[level01]',
      role: AggregationRole.level,
      text: {
        name: '[2CRVIDTASTORAGE].[level01]Text'
      }
    },
    '[2CRVITLOGO].[level01]': {
      name: '[2CRVITLOGO].[level01]',
      role: AggregationRole.level
    },
    '[2CRVIAREA].[level01]': {
      name: '[2CRVIAREA].[level01]',
      role: AggregationRole.level
    },
    counter: {
      name: 'counter',
      role: AggregationRole.measure
    },
    okCounter: {
      name: 'okCounter',
      role: AggregationRole.measure
    },
    failedCounter: {
      name: 'failedCounter',
      role: AggregationRole.measure
    },
    recordNumber: {
      name: 'recordNumber',
      role: AggregationRole.measure
    }
  }
}

export const DEPARTMENT_CUBE = {
  name: 'Sales',
  defaultMeasure: 'sales',
  calculatedMembers: [
    {
      dimension: '[Department]',
      hierarchy: '[Department]',
      name: 'C',
      formula: `[Department].[A] + [Department].[B]`
    },
    {
      dimension: '[Department]',
      hierarchy: '[Department]',
      name: 'D',
      formula: `[Department].[A] + [Department].[C]`
    }
  ]
}
export const DEPARTMENT_ENTITY_TYPE: any = {
  name: 'Sales',
  properties: {
    '[Department]': {
      role: AggregationRole.dimension,
      name: '[Department]',
      label: 'Department',
      cubeName: 'HR',
      dimensionName: 'Department',
      // dimensionUniqueName: '[Department]',
      dimensionCaption: 'Department',
      dimensionOrdinal: 6,
      dimensionType: 3,
      dimensionCardinality: 13,
      defaultHierarchy: '[Department]',
      description: 'HR Cube - Department Dimension',
      isVirtual: false,
      isReadwrite: false,
      dimensionUniqueSettings: 0,
      hierarchies: [
        {
          name: '[Department]',
          cubeName: 'HR',
          // dimensionUniqueName: '[Department]',
          hierarchyName: 'Department',
          hierarchyUniqueName: '[Department]',
          defaultMember: '[Department].[All Departments]',
          allMember: '[Department].[All Departments]',
          parentChild: false,
          levels: [
            {
              name: '[Department].[(All)]',
              levelName: '(All)',
              // levelUniqueName: '[Department].[(All)]',
              levelNumber: 0,
              levelType: 1
            },
            {
              name: '[Department].[Department Description]',
              levelName: 'Department Description',
              // levelUniqueName: '[Department].[Department Description]',
              levelNumber: 1,
              levelType: 0
            }
          ]
        }
      ]
    },
    '[Customers]': {
      role: AggregationRole.dimension,
      name: '[Customers]',
      label: 'Customers',
      cubeName: 'HR',
      dimensionName: 'Customers',
      // dimensionUniqueName: '[Department]',
      dimensionCaption: 'Customers',
      dimensionOrdinal: 6,
      dimensionType: 3,
      dimensionCardinality: 13,
      defaultHierarchy: '[Customers]',
      description: 'HR Cube - Customers Dimension',
      isVirtual: false,
      isReadwrite: false,
      dimensionUniqueSettings: 0,
      hierarchies: [
        {
          name: '[Customers]',
          cubeName: 'HR',
          // dimensionUniqueName: '[Department]',
          hierarchyName: 'Customers',
          hierarchyUniqueName: '[Customers]',
          defaultMember: '[Customers].[All Customers]',
          allMember: '[Customers].[All Customers]',
          parentChild: false,
          levels: [
            {
              name: '[Customers].[Country]',
              levelName: 'Country',
              levelNumber: 0,
              levelType: 1
            },
            {
              name: '[Customers].[State Province]',
              levelName: 'Customers State Province',
              levelNumber: 1,
              levelType: 0
            },
            {
              name: '[Customers].[Customer Name]',
              levelName: 'Customer Name',
              levelNumber: 2,
              levelType: 0
            }
          ]
        }
      ]
    },
    '[ZCALMONTH]': {
      role: AggregationRole.dimension,
      name: '[ZCALMONTH]',
      caption: 'ZCALMONTH',
      defaultHierarchy: '[ZCALMONTH                     Z_H_MONTH_01]',
      hierarchies: [
        {
          name: '[ZCALMONTH                     Z_H_MONTH_01]',
          caption: 'ZCALMONTH                     Z_H_MONTH_01',
          levels: [
            {
              name: '[ZCALMONTH                     Z_H_MONTH_01].[LEVEL00]',
              levelNumber: 0,
              levelType: 1
            },
            {
              name: '[ZCALMONTH                     Z_H_MONTH_01].[LEVEL01]',
              levelNumber: 1,
              levelType: 0
            }
          ]
        }
      ]
    },
    '[Time]': {
      role: AggregationRole.dimension,
      name: '[Time]',
      label: 'Time',
      hierarchies: [
        {
          name: '[Time]',
          label: 'Time',
          allMember: '[All Times]',
          allMemberName: null,
          catalogName: 'Demo - FoodMart Model',
          cubeName: 'Sales',
          defaultMember: '[Time].[All Times]',
          levels: [
            {
              name: '[Time].[All]',
              levelNumber: 0,
              levelType: 1
            },
            {
              name: '[Time].[Year]',
              levelNumber: 1,
              levelType: 0
            },
            {
              name: '[Time].[Month]',
              levelNumber: 2,
              levelType: 0
            }
          ]
        }
      ]
    },
    ZAMOUNT: {
      role: AggregationRole.measure,
      name: 'ZAMOUNT',
      label: 'zamount',
      cubeName: 'HR'
    }
  },
  dialect: MDXDialect.SAPBW,
}
