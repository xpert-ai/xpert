// import { Database, verbose } from 'sqlite3'
// import { BaseSQLQueryRunner, QueryResult, register, SQLAdapterOptions } from '../base'
// import { typeOfObj } from '../helpers'
// import { IDSSchema } from '../types'

// verbose()

// export interface LocalAgentAdapterOptions extends SQLAdapterOptions {
//   database: string
// }

// export class LocalAgent extends BaseSQLQueryRunner<LocalAgentAdapterOptions> {
//   readonly name = 'LocalAgent'
//   readonly type = 'agent'
//   readonly syntax = 'sql'
//   readonly protocol = 'sql'

//   readonly jdbcDriver = ''

//   jdbcUrl(schema?: string) {
//     return ''
//   }

//   get configurationSchema() {
//     return {
//       type: 'object',
//       properties: {
//         database: { type: 'string', default: 'user.sqlite3' }
//       }
//     }
//   }

//   db: Database
//   constructor(options: any) {
//     super(options)
//     this.db = new Database((this.options.database as string) || ':memory:')
//   }

//   async run(sql: string) {
//     return new Promise((resolve, reject) => {
//       this.db.run(sql, (err) => {
//         if (err) {
//           console.error(err)
//           return reject(err)
//         }
//         resolve({})
//       })
//     })
//   }

//   async runQuery(query: string): Promise<QueryResult> {
//     return new Promise((resolve, reject) => {
//       this.db.all(query, (err, data) => {
//         if (err) {
//           return reject(err)
//         }

//         const columns = data?.length ? typeOfObj(data[0]) : []
//         resolve({
//           status: 'OK',
//           data,
//           columns
//         })
//       })
//     })
//   }

//   async getCatalogs(): Promise<IDSSchema[]> {
//     return Promise.resolve([
//       {
//         name: 'default',
//         label: 'Default'
//       }
//     ])
//   }

//   async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
//     if (tableName) {
//       return this.runQuery(`PRAGMA table_info('${tableName}');`).then(({ data }) => {
//         return [
//           {
//             name: 'default',
//             schema: 'default',
//             tables: [
//               {
//                 name: tableName,
//                 columns: data.map((item: any) => ({
//                   ...item,
//                   type: typeMap(item.type)
//                 }))
//               }
//             ]
//           }
//         ]
//       })
//     }

//     return this.runQuery(`SELECT name FROM sqlite_master WHERE type = 'table';`).then(({ data }) => {
//       return [
//         {
//           name: 'default',
//           schema: 'default',
//           tables: data.map((item: any) => ({
//             name: item.name,
//             columns: []
//           }))
//         }
//       ]
//     })
//   }

//   async import({ name, columns, data, append }, options?): Promise<void> {
//     return new Promise((resolve, reject) => {
//       this.db.serialize(() => {
//         if (!append) {
//           this.db.run(`DROP TABLE IF EXISTS "${name}"`, (err: Error) => {
//             if (err) {
//               console.log(`DROP TABLE Error:`, err)
//               reject(err)
//             }
//           })
//         }
//         this.db.run(`CREATE TABLE IF NOT EXISTS "${name}" (${columns.map((col) => `"${col.fieldName}" ${col.type}`).join(', ')})`, (err: Error) => {
//           if (err) {
//             reject(err)
//           }
//         })
  
//         const stmt = this.db.prepare(`INSERT INTO "${name}" VALUES (${columns.map((col) => '?').join(',')})`)
//         for (let i = 0; i < data.length; i++) {
//           stmt.run(...columns.map((col) => data[i][col.name]))
//         }
//         stmt.finalize((err: Error) => {
//           if (err) {
//             reject(err)
//           } else {
//             resolve()
//           }
//         })
//       })
//     })
//   }

//   async teardown() {
//     this.db.close()
//   }
// }

// register('agent', LocalAgent)

// function typeMap(type: string): string {
//   switch (type) {
//     case 'INTEGER':
//       return 'number'
//     case 'TEXT':
//       return 'string'
//     default:
//       return type
//   }
// }
