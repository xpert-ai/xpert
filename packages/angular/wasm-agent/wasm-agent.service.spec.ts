import { TestBed } from '@angular/core/testing'
import { AgentType, Syntax, TableEntity, uuid } from '@xpert-ai/ocap-core'
import { NGM_WASM_AGENT_WORKER, WasmAgentService } from './wasm-agent.service'

describe('WasmAgentService', () => {
  let service: WasmAgentService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WasmAgentService,
        {
          provide: NGM_WASM_AGENT_WORKER,
          useValue: '@xpert-ai/ocap-duckdb/dist/ocap-agent-data-init.worker.js'
        }
      ]
    })
    service = TestBed.inject(WasmAgentService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('should add two numbers', (done) => {
    const modelName = 'Test wasm agent model'
    service.registerModel({
      id: uuid(),
      name: modelName,
      type: 'SQL',
      agentType: AgentType.Wasm,
      /**
       * 数据查询所使用的语言
       */
      syntax: Syntax.SQL,
      /**
       * 数据源内的方言, 如 OData 中有 SAP, Microsoft 等, XMLA 中有 SAP BW, SQL 数据库有 Postgres Mysql Hive 等
       */
      dialect: 'duckdb',
      /**
       * DB Schema / OData Catalog ...
       */
      catalog: 'main',

      /**
       * Table defination for wasm database
       */
      tables: [
        {
          name: 'topSubscribed',
          type: 'csv',
          sourceUrl: 'https://raw.githubusercontent.com/meta-d/samples/main/kaggle/topSubscribed.csv',
          header: true
        }
      ] as Array<TableEntity>
    })

    service
      .request(
        {
          name: modelName,
          type: 'SQL'
        },
        {}
      )
      .then((result) => {
        expect(result).toEqual({})
        done()
      })
  })
})
