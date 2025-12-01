// import { Agent, AgentStatusEnum, AgentType, AggregationRole, DataSourceOptions, Semantics } from '@metad/ocap-core'
// import { randFloat, randProductAdjective, randProductCategory } from '@ngneat/falso'
// import { Observable, of } from 'rxjs'


// const CALENDAR = {
//   __id__: '590d2e4a-ef71-49e4-b53f-36100cc5b004',
//   name: 'Time',
//   caption: '日历',
//   semantics: {
//     semantic: Semantics['Calendar']
//   },
//   hierarchies: [
//     {
//       __id__: 'cfdc9bab-46e4-4220-8cdf-44f1b5c7145c',
//       name: '',
//       caption: '日历',
//       hasAll: true,
//       primaryKey: 'time_id',
//       tables: [{ name: 'time_by_day' }],
//       levels: [
//         {
//           __id__: 'c3dc9239-8729-40bb-8e28-1c0a05d29834',
//           column: 'the_year',
//           name: 'Year',
//           caption: '年',
//           uniqueMembers: true,
//           nameColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeYears',
//           semantics: {
//             semantic: Semantics['Calendar.Year'],
//             formatter: '[yyyy]'
//           }
//         },
//         {
//           __id__: 'b5a0d2b8-c853-4480-bbaa-59a073b53047',
//           column: 'quarter',
//           name: 'Quarter',
//           caption: '季度',
//           uniqueMembers: null,
//           nameColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeQuarters',
//           semantics: {
//             semantic: Semantics['Calendar.Quarter'],
//             formatter: "[yyyy].['Q'Q]"
//           },
//           captionColumn: null,
//           ordinalColumn: null
//         },
//         {
//           __id__: 'cc0f564e-73ef-4761-bac7-2daa83cb7487',
//           column: 'month_of_year',
//           name: 'Month',
//           caption: '月',
//           nameColumn: null,
//           uniqueMembers: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeMonths',
//           semantics: {
//             semantic: Semantics['Calendar.Month'],
//             formatter: "[yyyy].['Q'Q].[M]"
//           },
//           captionColumn: 'the_month',
//           ordinalColumn: 'month_of_year'
//         },
//         {
//           __id__: 'a8f5b556-e278-42ba-8b8d-fcfdab8538c2',
//           column: 'the_date',
//           name: 'Day',
//           caption: '日期',
//           uniqueMembers: true,
//           nameColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeDays',
//           semantics: {
//             semantic: Semantics['Calendar.Day'],
//             formatter: "[yyyy].['Q'Q].[M].[yyyy-MM-dd]"
//           }
//         }
//       ]
//     },
//     {
//       __id__: '121096fb-bf4e-42c4-a776-c52c87fcf73c',
//       caption: '周日历',
//       hasAll: true,
//       name: 'Weekly',
//       allMemberName: null,
//       tables: [{ name: 'time_by_day' }],
//       primaryKey: 'time_id',
//       levels: [
//         {
//           __id__: '651b5863-ade3-4e97-a384-f9d778550927',
//           column: 'the_year',
//           name: 'Year',
//           caption: '年',
//           uniqueMembers: true,
//           nameColumn: null,
//           captionColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeYears',
//           semantics: { semantic: Semantics['Calendar.Year'] }
//         },
//         {
//           __id__: '3a35e9a2-b908-404a-bb11-8ba8404b1cfd',
//           column: 'week_of_year',
//           name: 'Week',
//           caption: '周',
//           uniqueMembers: null,
//           nameColumn: null,
//           captionColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeWeeks',
//           semantics: {
//             semantic: Semantics['Calendar.Week'],
//             formatter: '[yyyy].[W]'
//           }
//         },
//         {
//           __id__: '381b0a26-dbc1-41bb-bc5d-d9c61c17d9f0',
//           column: 'day_of_month',
//           name: 'Day',
//           caption: '日',
//           uniqueMembers: null,
//           nameColumn: null,
//           captionColumn: null,
//           parentColumn: null,
//           nullParentValue: null,
//           levelType: 'TimeDays',
//           semantics: {
//             semantic: Semantics['Calendar.Day'],
//             formatter: '[yyyy].[W].[Do]'
//           }
//         }
//       ]
//     }
//   ]
// }

// export const CUBE_SALES_ORDER = {
//   name: 'SalesOrder',
//   label: '销售订单',
//   tables: [{ name: 'sales_order' }],
//   defaultMeasure: 'Sales',
//   dimensions: [
//     CALENDAR,
//     {
//       name: 'Product',
//       hierarchies: [
//         {
//           name: '',
//           label: '产品',
//           levels: [
//             {
//               name: 'Product',
//               column: 'product',
//               captionColumn: 'ProductName'
//             }
//           ]
//         }
//       ]
//     },
//     {
//       name: 'Department',
//       hierarchies: [
//         {
//           name: '',
//           levels: [
//             {
//               name: 'Department',
//               column: 'department',
//               captionColumn: 'DepartmentName'
//             }
//           ]
//         }
//       ]
//     }
//   ],
//   measures: [
//     {
//       name: 'Sales',
//       column: 'sales'
//     }
//   ]
// }

// export class MockAgent implements Agent {
//   type = AgentType.Browser

//   selectStatus(): Observable<AgentStatusEnum> {
//     return of(AgentStatusEnum.ONLINE)
//   }
//   selectError(): Observable<any> {
//     throw new Error('Method not implemented.')
//   }

//   error(err: any): void {
//     // this.error$.next(err)
//   }

//   request(dataSource: DataSourceOptions, options: any): Promise<any> {
//     return new Promise((resolve, reject) => {
//       if (options.method === 'get') {
//         if (options.url === 'schema') {
//           if (options.table) {
//             switch (options.table) {
//               case 'SalesOrder':
//                 return resolve([
//                   {
//                     schema: 'default',
//                     tables: [
//                       {
//                         name: 'SalesOrder',
//                         label: '销售订单',
//                         columns: [
//                           {
//                             name: 'product',
//                             label: '产品',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'productCategory',
//                             label: '产品类别',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'sales',
//                             label: '销售额',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           },
//                           {
//                             name: 'quantity',
//                             label: '销售量',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           }
//                         ]
//                       }
//                     ]
//                   }
//                 ])
//               case 'Inventory':
//                 return resolve([
//                   {
//                     schema: 'default',
//                     tables: [
//                       {
//                         name: 'Inventory',
//                         label: '库存',
//                         columns: [
//                           {
//                             name: 'product',
//                             label: '产品',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'productCategory',
//                             label: '产品类别',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'sales',
//                             label: '销售额',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           },
//                           {
//                             name: 'quantity',
//                             label: '销售量',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           }
//                         ]
//                       }
//                     ]
//                   }
//                 ])
//               default:
//                 return resolve([
//                   {
//                     schema: 'default',
//                     tables: [
//                       {
//                         name: 'Inventory',
//                         label: '库存',
//                         columns: [
//                           {
//                             name: 'product',
//                             label: '产品',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'productCategory',
//                             label: '产品类别',
//                             type: 'string',
//                             aggregationRole: AggregationRole.dimension
//                           },
//                           {
//                             name: 'sales',
//                             label: '销售额',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           },
//                           {
//                             name: 'quantity',
//                             label: '销售量',
//                             type: 'number',
//                             aggregationRole: AggregationRole.measure
//                           }
//                         ]
//                       }
//                     ]
//                   }
//                 ])
//             }
//           } else if (options.statement) {
//             return resolve([
//               {
//                 name: 'SalesOrder',
//                 label: '销售订单',
//                 columns: [
//                   {
//                     name: 'product',
//                     label: '产品',
//                     type: 'string',
//                     aggregationRole: AggregationRole.dimension
//                   },
//                   {
//                     name: 'productCategory',
//                     label: '产品类别',
//                     type: 'string',
//                     aggregationRole: AggregationRole.dimension
//                   },
//                   {
//                     name: 'sales',
//                     label: '销售额',
//                     type: 'number',
//                     aggregationRole: AggregationRole.measure
//                   },
//                   {
//                     name: 'quantity',
//                     label: '销售量',
//                     type: 'number',
//                     aggregationRole: AggregationRole.measure
//                   }
//                 ]
//               }
//             ])
//           } else {
//             return resolve([
//               {
//                 schema: 'default',
//                 tables: [
//                   {
//                     name: 'SalesOrder',
//                     label: '销售订单'
//                   }
//                 ]
//               }
//             ])
//           }
//         } else if (options.url === 'catalogs') {
//           return resolve([{ name: 'default' }, { name: 'foodmart' }])
//         }
//       } else if (options.method === 'post') {
//         if (options.url === 'query') {
//           const results = []

//           randProductCategory({ length: 3 }).forEach((productCategory) => {
//             randProductAdjective({ length: 5 }).forEach((product) => {
//               results.push({
//                 product,
//                 productCategory,
//                 sales: randFloat(),
//                 quantity: randFloat()
//               })
//             })
//           })

//           return resolve({
//             data: results,
//             columns: [],
//             statement: options.body?.statement
//           })
//         }
//       }

//       return reject(`Unknow method ${options.url}`)
//     })
//   }
// }
