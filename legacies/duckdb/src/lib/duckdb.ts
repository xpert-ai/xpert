import { AsyncDuckDB, AsyncDuckDBConnection, ConsoleLogger, DuckDBBundles, DuckDBDataProtocol, LogLevel, selectBundle } from '@duckdb/duckdb-wasm'
import { Agent, AgentStatusEnum, AgentType, DataSourceOptions, isEqual, pick, SemanticModel, TableColumnType, TableEntity } from '@metad/ocap-core'
import { DataType, Bool, Utf8, Float64, Int32, Date_, DateUnit, Table } from 'apache-arrow'
import { BehaviorSubject, filter, firstValueFrom, map, Observable, ReplaySubject, Subject } from 'rxjs'

const MANUAL_BUNDLES: DuckDBBundles = {
  mvp: {
    mainModule: './assets/duckdb-mvp.wasm',
    mainWorker: './assets/duckdb-browser-mvp.worker.js'
  },
  eh: {
    mainModule: './duckdb-eh.wasm',
    mainWorker: './assets/duckdb-browser-eh.worker.js'
  }
}

const CARE_MODEL_PROPS = ['catalog', 'tables', 'dbInitialization']

export class DuckdbWasmAgent implements Agent {
  type = AgentType.Wasm

  private status$ = new Subject<{status: AgentStatusEnum, payload?: any}>()
  private error$ = new Subject()
  // private intial = true
  private progress: number[] = []
  private db: AsyncDuckDB
  private intial$: Subject<boolean>
  // public _connection$ = new BehaviorSubject<AsyncDuckDBConnection>(null)
  // public connection$ = this._connection$.asObservable().pipe(filter((value) => !!value))

  private models = {}

  private models$ = new ReplaySubject(1)

  constructor(models: any, private workerUrl: string) {
    models?.forEach((model) => (this.models[model.name] = model))
  }

  error(err: any): void {
    this.error$.next(err)
  }

  selectStatus(): Observable<AgentStatusEnum | any> {
    return this.status$
  }

  selectError(): Observable<any> {
    return this.error$
  }

  async connect() {
    console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~ duckdb connecting ~~~~~~~~~~~~~~~~~~~~~~~~~~`)
    this.intial$ = new BehaviorSubject<boolean>(false)
    // // Select a bundle based on browser checks
    const bundle = await selectBundle(MANUAL_BUNDLES)
    // // Instantiate the asynchronus version of DuckDB-wasm
    const worker = new Worker(bundle.mainWorker as string)
    const logger = new ConsoleLogger(LogLevel.WARNING)
    this.db = new AsyncDuckDB(logger, worker)
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    
    this.intial$.next(true)
    // const connection = await this.db.connect()
    // this._connection$.next(connection)
  }

  async getConnection(): Promise<AsyncDuckDBConnection> {
    if (!this.intial$) {
      await this.connect()
    }

    await firstValueFrom(this.intial$.pipe(filter((value) => value)))
    const connection = await this.db.connect()
    return connection
  }

  async getModel(name: string) {
    return await firstValueFrom(
      this.models$.pipe(
        map((models) => models[name]),
        filter((value) => !!value)
      )
    )
  }

  async registerModel(model: SemanticModel) {
    const name = model?.name
    if (!name) {
      return
    }

    // 重复注册时直接返回
    if (isEqual(pick(this.models[name], ...CARE_MODEL_PROPS), pick(model, ...CARE_MODEL_PROPS))) {
      return
    }

    // 清空相应 Model, 让请求等待新的 Model 初始化完成
    this.models[name] = null
    this.models$.next({ ...this.models })
    this.status$.next({status: AgentStatusEnum.Initializing, payload: 0})
    const connection = await this.getConnection()
    try {
      await this.initDB(connection, model)
    } catch (err: any) {
      this.error(err?.message)
    } finally {
      await connection.close()
      this.status$.next({status: AgentStatusEnum.ONLINE})
    }
    this.models[name] = model
    this.models$.next({ ...this.models })
  }

  async initDB(connection: AsyncDuckDBConnection, model: SemanticModel) {
    this.progress = model.tables?.map(() => 0)

    // Schema for Model
    if (model.catalog) {
      // await connection.query(`DROP SCHEMA IF EXISTS ${model.catalog} CASCADE;`)
      await connection.query(`CREATE SCHEMA IF NOT EXISTS ${model.catalog};`)
    }

    // Init table entities
    if (model.tables) {
      for(const [index, entity] of model.tables.entries()) {
        const tableName = model.catalog ? `"${model.catalog}"."${entity.name}"` : `"${entity.name}"`
        await connection.query(`DROP TABLE IF EXISTS ${tableName}`)

        if (entity.type === 'parquet') {
          // @todo 增加了后面两个参数对不对？？？
          await this.db.registerFileURL(entity.name, entity.sourceUrl, DuckDBDataProtocol.HTTP, true)
          await connection.query(`CREATE TABLE "${entity.name}" AS SELECT * FROM read_parquet('${entity.name}')`)
          this.setProgress(index, 100)
        } else if (entity.type === 'csv') {
          await this.insertCSVFromPath(model, entity)
          this.setProgress(index, 100)
        } else if (entity.type === 'json') {
          await connection.insertJSONFromPath(entity.sourceUrl, {
            schema: model.catalog,
            name: entity.name
          })
          this.setProgress(index, 100)
        } else if (entity.type === 'excel') {
          // Load from excel
          const wb = await this.fetchExcelFile(index, entity.sourceUrl, entity.name)
          if (!wb) {
            continue
          }
          for(const item of wb) {
            const sheet = entity.sheets?.find((sh) => sh.name === item.name)
            const tableName = sheet?.tableName || item.name
            await this.db.registerFileText(tableName + '.json', item.sdata)
            const columns = {}
            sheet?.columns?.forEach((column) => {
              columns[column.name] = column.type === 'string' ? new Utf8() : new Float64()
            })
            await connection.insertJSONFromPath(tableName + '.json', {
              schema: model.catalog,
              name: tableName,
              columns
            })
          }
        } else {
          throw new Error(`Unsupport type for '${entity.type}'`)
        }
      }
    }

    // Init by dbInitialization script
    if (model.dbInitialization) {
      const query = model.catalog ? `SET search_path TO ${model.catalog};${model.dbInitialization}` :
        model.dbInitialization
      await connection.query(query)
    }
  }

  async request(dataSource: DataSourceOptions, options: any): Promise<any> {

    const connection = await this.getConnection()
    // waiting the model prepared
    await this.getModel(dataSource.name)

    this.status$.next({status: AgentStatusEnum.LOADING})

    try {
      let results = null
      if (options.method === 'get') {
        if (options.url === 'schema') {
          if (options.table) {
            // const results = await this.query(connection, `SELECT * FROM ${options.table} LIMIT 1`)
            const columns = await this.getTableColumns(dataSource.catalog, options.table ?? options.statement)
            results = [{
              schema: dataSource.catalog,
              tables: [
                {
                  name: options.table,
                  columns
                }
              ]
            }]
          } else if(options.statement) {
            const columns = await this.getStatementColumns(dataSource.catalog, options.statement)
            // TODO
            results = [{
              name: options.table,
              columns
            }]
          } else {
            const tables = await this.getTables(dataSource.catalog)
            results = [{
              schema: dataSource.catalog,
              tables
            }]
          }
        } else if (options.url === 'catalogs') {
          results = await this.getDatabases()
        }
      } else if (options.method === 'post') {
        if (options.url === 'query') {
          try {
            await connection.query(`SET search_path TO ${dataSource.catalog};`)
            results = await connection.query(options.body.statement)
          } catch (error: any) {
            // Try again ?
            try {
              results = await connection.query(options.body.statement)
            } catch(error: any) {
              this.status$.next({status: AgentStatusEnum.ONLINE})
              return Promise.reject(error)
            }
          }
          
          const columns = results.schema.fields.map((d) => ({
            name: d.name,
            nullable: d.nullable,
            type: mapArrowType(d.type)
          }))
          const measures = columns.filter((col) => col.type === 'number')
          const rows = results.toArray().map(Object.fromEntries) as any

          results = {
            data: rows.map((row) => {
              const item = { ...row }
              measures.forEach(({ name }) => {
                // item[name] = item[name] instanceof Uint32Array ? item[name][0] : item[name]
                item[name] = item[name]?.length ? item[name][0] : item[name]
                /**
                 * Many frameworks can't support bigInt number, so
                 */
                if (typeof item[name] === 'bigint') {
                  item[name] = Number(item[name])
                }
              })
              return item
            }),
            columns
          }
        }
      }

      this.status$.next({status: AgentStatusEnum.ONLINE})

      if (results) {
        return results
      }
    } catch(error: any) {
      this.status$.next({status: AgentStatusEnum.ONLINE})
      this.error(error.message)
    } finally {
      await connection.close()
      // console.log(`request query connection closed!`)
    }

    throw new Error('Method not implemented.')
  }

  async query(connection: AsyncDuckDBConnection, statement: string) {
    // @todo ???
    return await connection.query(statement) as any
  }

  async getDatabases() {
    const connection = await this.getConnection()
    const results = await this.query(connection, `PRAGMA database_list;`)

    return results
      .toArray()
      .map(Object.fromEntries)
      .map(({ name, file }) => ({
        name,
        type: file
      }))
  }

  async getTables(catalog?: string) {
    const connection = await this.getConnection()
    if (catalog) {
      await connection.query(`SET search_path TO ${catalog};`)
    }
    const results = await this.query(connection, `PRAGMA show_tables;`)

    return results
      .toArray()
      .map(Object.fromEntries)
      .map(({ name }) => ({
        name
      }))
  }

  async getTableColumns(schemaName: string, tableName: string) {
    const connection = await this.getConnection()
    const statement = `DESCRIBE ${schemaName ? schemaName + '.' : ''}${tableName}`
    const results = await this.query(connection, statement)

    // console.log(`[Duckdb] Execute:`, statement, ` = `, JSON.stringify(results.toArray()))

    return results
      .toArray()
      // .map(({ Field, Null, Type }) => ({
      //   name: Field,
      //   nullable: Null === 'YES',
      //   type: mapType(Type)
      // }))
      .map(({ column_name, null: isNull, column_type, key }) => ({
        name: column_name,
        nullable: isNull === 'YES',
        type: mapType(column_type)
      }))
  }

  async getStatementColumns(schemaName: string, statement: string) {
    const connection = await this.getConnection()
    statement = `DESCRIBE ${statement}`
    const results = await this.query(connection, statement)

    // console.log(`[Duckdb] Execute:`, statement, ` = `, results)

    return results
      .toArray()
      .map(({ column_name, null: isNull, column_type, key }) => ({
        name: column_name,
        nullable: isNull === 'YES',
        type: mapType(column_type)
      }))
  }

  setProgress(index: number, progress: number) {
    this.progress[index] = progress
    this.status$.next({
      status: AgentStatusEnum.Initializing,
      payload: this.progress.reduce((accumulator, value) => accumulator + value, 0) / (100 * this.progress.length) * 100
    })
  }

  /**
   * Fetch the excel file at index and return the data array
   * 
   * @param index 
   * @param url 
   * @param name 
   * @returns 
   */
  fetchExcelFile(index: number, url: string, name: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (typeof Worker !== 'undefined') {
        // Create a new
        // const worker = new Worker(new URL('../worker/excel.worker', import.meta.url), { type: 'module' });
        const worker = new Worker(this.workerUrl, { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (data.type === 'DownloadProgress') {
            this.setProgress(index, data.payload)
          } else {
            worker.terminate()
            if (data.error) {
              reject(data.error)
            } else {
              resolve(data.payload)
            }
          }
        }
        worker.postMessage({
          url,
          name
        })
      } else {
        // Web workers are not supported in this environment.
        // You should add a fallback so that your program still executes correctly.
        throw new Error(`Web workers are not supported in this environment`)
      }
    })
  }

  async insertCSVFromPath(model: SemanticModel, entity: TableEntity) {
    const response = await fetch(entity.sourceUrl)
    if (!response.ok) {
      throw new Error(`Can't download file '${entity.sourceUrl}' for reason: ${response.statusText || response.status}`)
    }

    const text = await response.text()
    const options: any = {
      create: true,
      schema: model.catalog,
      name: entity.name,
      detect: true,
      header: true
    }
    if (entity.delimiter) {
      options.delimiter = entity.delimiter
    }
    // 指定列类型在移动端还有问题未解决!
    if (entity.columns?.length) {
      options.detect = false
      options.header = entity.header ?? false
      options.columns = {}
      entity.columns.forEach(({name, type}) => {
        options.columns[name] = mapToArrowType(type)
      })
    }

    const connection = await this.db.connect()
    try {
      if (entity.batchSize) {
        const lines = text.split(/\r\n|\r|\n/)
        const header = options.header ? lines.splice(0, 1)[0] : null
        while(lines.length) {
          const bulk = lines.splice(0, entity.batchSize)
          if (options.header) {
            bulk.splice(0, 0, header)
          }
          await this.db.dropFile(entity.name)
          await this.db.registerFileText(entity.name, bulk.join('\r\n'))
          await connection.insertCSVFromPath(entity.name, options)
          options.create = false
          // console.log(lines.length)
        }
      } else {
        await this.db.registerFileText(entity.name, text)
        await connection.insertCSVFromPath(entity.name, options)
      }
    } finally {
      await connection.close()
    }
  }
}

export function mapArrowType(type) {
  if (DataType.isDecimal(type) || DataType.isInt(type) || DataType.isFloat(type)) {
    return 'number'
  }

  return 'string'
}

// export async function insertArrowFromIPCStream(c, name, url) {
//   const streamResponse = await fetch(url)
//   const streamReader = streamResponse.body.getReader()
//   const streamInserts = []
//   let conti = true
//   while (conti) {
//     const { value, done } = await streamReader.read()
//     if (done) {
//       conti = false
//       break
//     }
//     streamInserts.push(c.insertArrowFromIPCStream(value, { name }))
//   }
//   return await Promise.all(streamInserts)
// }

export function mapType(type: string) {
  switch (type) {
    case 'BOOLEAN':
      return 'boolean'
    case 'TINYINT':
      return 'number'
    case 'SMALLINT':
      return 'number'
    case 'INTEGER':
      return 'number'
    case 'BIGINT':
      return 'number'
    case 'UTINYINT':
      return 'number'
    case 'USMALLINT':
      return 'number'
    case 'UINTEGER':
      return 'number'
    case 'UBIGINT':
      return 'number'
    case 'FLOAT':
      return 'number'
    case 'HUGEINT':
      return 'number'
    case 'DOUBLE':
      return 'number'
    case 'VARCHAR':
      return 'string'
    case 'DATE':
      return 'date'
    case 'TIME':
      return 'string'
    case 'TIMESTAMP':
      return 'string'
    default:
      return null
  }
}

export function mapToArrowType(type: TableColumnType) {
  switch(type) {
    case 'String':
      return new Utf8()
    case 'Integer':
      return new Int32()
    case 'Numeric':
      return new Float64()
    case 'Boolean':
      return new Bool()
    case 'Date':
      return new Date_(DateUnit.DAY)
    case 'Datetime':
      return new Date_(DateUnit.MILLISECOND)
    default:
      return new Utf8()
  }
}
