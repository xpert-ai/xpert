import { DataSourceAgent, DSCacheService, NxDSCoreModule, NxDSCoreService } from '@xpert-ai/ds-core'
import { ENTITY_TYPE } from '../test/DATA'
import { MDXDialect } from './types'

describe('NxDSXmlaService', () => {
  // let service: NxDSCoreService
  // let httpMock: HttpTestingController

  // beforeEach(() => {
  //   TestBed.configureTestingModule({
  //     imports: [
  //       HttpClientTestingModule,
  //       NxDSCoreModule.forRoot(),
  //       NxDSXmlaModule.forRoot({
  //         '': {
  //           type: 'XMLA',
  //           baseUrl: 'http://127.0.0.1:8080/',
  //           uri: '/xmla',
  //           settings: {
  //             catalog: '2CRVCREQUEST',
  //           },
  //           entityTypes: {
  //             '2CRVCREQUEST/2CRVCREQQRY': {
  //               entityType: ENTITY_TYPE,
  //             },
  //           },
  //         },
  //       }),
  //     ],
  //   })

  //   httpMock = TestBed.inject(HttpTestingController)
  // })

  // afterEach(() => {
  //   httpMock.verify()
  // })

  
  it('#Create DataSource', () => {
    // const service = new NxXmlaDataSource({
    //   type: 'XMLA',
    //   settings: {
    //     dataSourceInfo: '',
    //     catalog: ''
    //   },
    //   dialect: MDXDialect.Mondrian
    // }, new DSCacheService(), null)

    // expect(service).toBeDefined()
  })

  // it('#getDataSource should return dataSource instance', (done) => {
  //   service = TestBed.inject(NxDSCoreService)
  //   expect(service).toBeDefined()

  //   service.getDataSource('').subscribe((dataSource) => {
  //     expect(dataSource.options).toEqual(
  //       jasmine.objectContaining({
  //         name: '',
  //         type: 'XMLA',
  //         baseUrl: 'http://127.0.0.1:8080/',
  //         uri: '/xmla',
  //         settings: {
  //           catalog: '2CRVCREQUEST',
  //         },
  //       })
  //     )
  //     done()
  //   })
  // })

  // it('#createEntityService', (done) => {
  //   service = TestBed.inject(NxDSCoreService)
  //   expect(service).toBeDefined()
  //   service.getDataSource().subscribe((dataSource) => {
  //     const entityService = dataSource.createEntityService<any>('2CRVCREQUEST/2CRVCREQQRY')
  //     entityService
  //       .getEntityType()
  //       .pipe(take(1))
  //       .subscribe((entityType) => {
  //         done()
  //       })
  //   })
  // })

  // it('#EntityService fetch results', (done) => {
  //   service = TestBed.inject(NxDSCoreService)
  //   expect(service).toBeDefined()
  //   service.getDataSource().subscribe((dataSource) => {
  //     const entityService = dataSource.createEntityService<any>('2CRVCREQQRY')
  //     entityService
  //       .getEntityType()
  //       .pipe(take(1))
  //       .subscribe((entityType) => {
  //         entityService.query({
  //           selects: [
  //             '[2CRVIDTASTORAGE].[level01]',
  //             '[2CRVITLOGO].[level01]',
  //             '[2CRVIAREA].[level01]',
  //             'counter',
  //             'okCounter',
  //             'recordNumber',
  //           ],
  //         }).subscribe(results => {
  //           console.warn(results)
  //           expect(results[0]).toBeDefined()
  //           done()
  //         })
  //       })
  //   })

  //   // const req = httpMock.expectOne(`http://127.0.0.1:3001/sap/bw/xml/soap/xmla`)
  //   // req.flush({})
  // })

//   it('#extractDimension', () => {
//     expect(extractHierarchy('[AAA].[LEVEL00]')).toEqual({
//       dimension: '[AAA]',
//       level: '00',
//     })
//     expect(extractHierarchy('[AAA].[level01]')).toEqual({
//       dimension: '[AAA]',
//       level: '01',
//     })
//     expect(extractHierarchy('[/CPMB/IKD6CIV                 PARENTH1].[LEVEL00].Members')).toEqual({
//       dimension: '[/CPMB/IKD6CIV                 PARENTH1]',
//       level: '00',
//     })
//     expect(extractHierarchy('[/CPMB/IKD6CIV                 PARENTH1].[LEVEL00].Members')).toEqual({
//       dimension: '[/CPMB/IKD6CIV                 PARENTH1]',
//       level: '00',
//     })
//   })

//   it('#generateMDXStatement', () => {
//     expect(
//       generateMDXStatement(
//         '2CRVCREQUEST/2CRVCREQQRY',
//         ENTITY_TYPE,
//         {
//           selects: [
//             '[2CRVIDTASTORAGE].[level01]',
//             '[2CRVITLOGO].[level01]',
//             '[2CRVIAREA].[level01]',
//             'counter',
//             'okCounter',
//             'recordNumber',
//           ],
//         }
//       )
//     ).toEqual(`SELECT
// {[Measures].[counter],[Measures].[okCounter],[Measures].[recordNumber]} ON COLUMNS,
// non empty {[2CRVIDTASTORAGE].[LEVEL01]*[2CRVITLOGO].[LEVEL01]*[2CRVIAREA].[LEVEL01]} ON ROWS
// FROM [2CRVCREQUEST/2CRVCREQQRY]`)
//   })

//   it('#hierarchy', () => {
//     service = TestBed.inject(NxDSCoreService)
//     expect(service).toBeDefined()
//     service.getDataSource()
//   })
})
