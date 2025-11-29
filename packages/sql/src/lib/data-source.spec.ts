// import { Agent, AgentStatus, AgentType, DataSourceOptions, DSCacheService, isEntitySet, isEntityType } from '@metad/ocap-core'
// import { EMPTY, firstValueFrom, Observable, skip } from 'rxjs'
// import { MockAgent } from './agent-mock.service'
// import { SQLDataSource } from './data-source'
// import { ENTITY_TYPE_SALESORDER, SCHEMA } from './mock-data'

// describe('SQL DataSource', () => {
//   let dataSource: SQLDataSource
//   beforeAll(() => {
//     dataSource = new SQLDataSource(
//       {
//         type: 'SQL',
//         schema: SCHEMA
//       },
//       new MockAgent(),
//       new DSCacheService()
//     )
//   })

//   it('should work', async () => {
//     expect(dataSource).toBeTruthy()
//   })

//   it('discoverDBCatalogs', async () => {
//     let catalogs = await firstValueFrom(dataSource.discoverDBCatalogs())
//     expect(catalogs).toEqual([{ name: 'default' }, { name: 'foodmart' }])

//     catalogs = await firstValueFrom(dataSource.discoverDBCatalogs())
//     expect(catalogs).toEqual([{ name: 'default' }, { name: 'foodmart' }])

//     catalogs = await firstValueFrom(dataSource.discoverDBCatalogs())
//     expect(catalogs).toEqual([{ name: 'default' }, { name: 'foodmart' }])
//   })

//   it('getEntitySets', async () => {
//     const entitySets = await firstValueFrom(dataSource.getEntitySets())
//     expect(entitySets).toEqual([
//       {
//         catalog: 'default',
//         name: 'SalesOrder',
//         caption: '销售订单'
//       }
//     ])
//   })

//   it('getEntityType', async () => {
//     const entitySet = await firstValueFrom(dataSource.selectEntitySet('SalesOrder'))
//     if (isEntitySet(entitySet)) {
//       const { entityType } = entitySet
//       expect(entityType.name).toEqual('SalesOrder')
//       expect(entityType).toEqual(ENTITY_TYPE_SALESORDER)
//     }

//     const entityType = await firstValueFrom(dataSource.getEntityType('Inventory'))

//     expect(entityType).toEqual({
//       name: 'Inventory',
//       caption: '库存',
//       properties: {
//         product: {
//           __id__: 'product',
//           dataType: 'string',
//           dimension: 'product',
//           entity: 'Inventory',
//           caption: '产品',
//           name: 'product',
//           role: 'dimension'
//         },
//         productCategory: {
//           __id__: 'productCategory',
//           dataType: 'string',
//           dimension: 'productCategory',
//           entity: 'Inventory',
//           caption: '产品类别',
//           name: 'productCategory',
//           role: 'dimension'
//         },
//         quantity: {
//           __id__: 'quantity',
//           dataType: 'number',
//           dimension: 'quantity',
//           entity: 'Inventory',
//           caption: '销售量',
//           name: 'quantity',
//           role: 'measure'
//         },
//         sales: {
//           __id__: 'sales',
//           dataType: 'number',
//           dimension: 'sales',
//           entity: 'Inventory',
//           caption: '销售额',
//           name: 'sales',
//           role: 'measure'
//         }
//       }
//     })
//   })

//   it('getEntityType react schema update', (done) => {
//     dataSource
//       .getEntityType('SalesOrder')
//       .pipe(skip(1))
//       .subscribe((entityType) => {
//         expect(entityType.name).toEqual('SalesOrder')
//         done()
//       })

//     setTimeout(() => {
//       dataSource.setSchema({
//         name: 'Sales',
//         cubes: [
//           {
//             name: 'SalesOrder',
//             tables: [{ name: 'SalesOrder1' }],
//             defaultMeasure: ''
//           }
//         ]
//       })
//     })
//   })
// })

// describe('Get EntityType with Exception', () => {
//   let dataSource: SQLDataSource

//   class WithExceptionAgent implements Agent {
//     type = AgentType.Browser

//     selectStatus(): Observable<AgentStatus> {
//       return EMPTY
//     }
//     selectError(): Observable<any> {
//       return EMPTY
//     }

//     error(err: any): void {
//       //
//     }

//     request(dataSource: DataSourceOptions, options: any): Promise<any> {
//       return new Promise((resolve, reject) => {
//         if (options.method === 'get') {
//           if (options.url === 'schema') {
//             if (options.statement === 'SELECT * FROM "ErrorTable"') {
//               throw new Error(`I am error`)
//             }
//             return resolve([
//               {
//                 name: 'Sales',
//                 label: '销售',
//                 columns: []
//               }
//             ])
//           } else if (options.url === 'catalogs') {
//             return resolve([
//               { name: 'Sales', label: '销售' },
//               { name: 'Inventory', label: '库存' }
//             ])
//           }
//         } else if (options.method === 'post') {
//           if (options.url === 'query') {
//             const results = []
//             return resolve({
//               data: results,
//               columns: []
//             })
//           }
//         }

//         return reject(`Unknow method ${options.url}`)
//       })
//     }
//   }

//   beforeAll(() => {
//     dataSource = new SQLDataSource(
//       {
//         type: 'SQL',
//         schema: {
//           name: 'Sales',
//           cubes: [
//             {
//               __id__: '123',
//               name: 'SalesOrder',
//               tables: [{ name: 'ErrorTable' }],
//               defaultMeasure: ''
//             }
//           ]
//         }
//       },
//       new WithExceptionAgent(),
//       new DSCacheService()
//     )
//   })

//   it('With Exception', (done) => {
//     dataSource.getEntityType('SalesOrder').subscribe((entityType) => {
//       // expect(entityType).toEqual(null)
//       done()
//     })
//   })

//   it('Skip Exception', (done) => {
//     dataSource
//       .getEntityType('SalesOrder')
//       .pipe(skip(1))
//       .subscribe((entityType) => {
//         expect(entityType).toEqual({
//           label: undefined,
//           name: 'SalesOrder',
//           defaultMeasure: '',
//           properties: {},
//           semantics: 'aggregate'
//         })
//         done()
//       })

//     setTimeout(() => {
//       // Update correct table to get EntityType
//       dataSource.updateCube({
//         __id__: '123',
//         name: 'SalesOrder',
//         tables: [{ name: 'SalesOrder' }],
//         defaultMeasure: ''
//       })
//     })
//   })
// })
