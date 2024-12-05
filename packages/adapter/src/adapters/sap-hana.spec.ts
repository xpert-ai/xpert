// import { BaseSQLQueryRunner } from '../base'
// import { TableTopSubscribed } from './mock'
// import { HANAQueryRunner } from './sap-hana'

// const HANA_HOST = process.env.SAP_HANA_HOST || ''
// const HANA_PORT = Number(process.env.SAP_HANA_PORT || 39017)
// const HANA_SCHEMA = process.env.SAP_HANA_SCHEMA || 'Z_DEMO'
// const HANA_PASSWORD = process.env.SAP_HANA_PASSWORD || ''

// describe('SAP HANA QueryRunner', () => {
//   let runner: BaseSQLQueryRunner

//   beforeEach(() => {
//     runner = new HANAQueryRunner({
//       host: HANA_HOST,
//       port: HANA_PORT,
//       username: 'system',
//       password: HANA_PASSWORD,
//       database: 'SYSTEMDB',
//       // use_ssl: true,
//       // ssl_cacert: ``
//     })
//   })

//   it('#getCatalogs', async () => {
//     const catalogs = await runner.getCatalogs()
//     console.log(catalogs)
//     expect(catalogs.length).toBeGreaterThan(0)
//   })

//   it('#getSchema', async () => {
//     const schema = await runner.getSchema(HANA_SCHEMA)
//     console.log(JSON.stringify(schema))
//     expect(schema.length).toBeGreaterThan(0)
//     expect(schema[0].tables.length).toBeGreaterThan(0)
//   })

//   it('#describe', async () => {
//     const result = await runner.describe('foodmart', 'SELECT * FROM topSubscribed')
//     console.log(result)
//   })

//   it('#createCatalog', async () => {
//     await runner.createCatalog(HANA_SCHEMA)
//   })

//   it('#CreateTable', async () => {
//     const result = await runner.runQuery(`Create Table Demo_HANA (
//       ID INTEGER,
//       NAME VARCHAR(10),
//       PRIMARY KEY (ID)
//    );`, { catalog: HANA_SCHEMA })
//     console.log(result)
//   })

//   it('#ping', async () => {
//     await runner.ping()
//   })

//   it('#QueryTable', async () => {
//     const result = await runner.getSchema(null, 'SupermartGrocerySales')
//     console.log(result)
//   })

//   it('#import', async () => {
//     await runner.import({...TableTopSubscribed}, {catalog: HANA_SCHEMA})

//     const result = await runner.runQuery(`SELECT * FROM "topSubscribed"`, {catalog: HANA_SCHEMA})
//     expect(result.data.length).toEqual(15)
//   })
// })
