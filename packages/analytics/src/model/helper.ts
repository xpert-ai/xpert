import { ISemanticModel } from '@metad/contracts'
import {
  camelCase,
  cloneDeep,
  cloneDeepWith,
  forIn,
  isArray,
  isNil,
  isObject,
  isString,
  assign, omit, omitBy
} from 'lodash'
import { Observable } from 'rxjs'
import { RedisClientType } from 'redis'
import xml2js from 'xml2js'
import { convertSchemaRolesToXmla, convertSchemaToXmla } from './mdx'
import { AdapterBaseOptions } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import { DataSourceStrategyQuery } from '../data-source'


export function buildSchema(input: any): string {
  const schema = cloneDeepWith(cloneDeep(input), (value: any, key, object) => {
    if (isObject(value) && !isArray(value) && key !== '$') {
      forIn(value, (v, key) => {
        if (isNil(v)) {
          delete value[key]
        }else if (isString(key) && key !== '_') {
          if (key.startsWith('__') && key.endsWith('__')) {
            delete value[key]
          } else if (camelCase(key) === key) {
            value['$'] = value['$'] || {}
            value['$'][key] = v
            delete value[key]
          }
        }
      })
    }
  })

  const builder = new xml2js.Builder()
  return builder.buildObject(schema)
}

function parseBooleans(str) {
  if (/^(?:true|false)$/i.test(str)) {
    str = str.toLowerCase() === 'true'
  }
  return str
}

export function parseSchema(input: string) {
  // const parser = xml2js.Parser({ parseBooleans: true })
  return new Observable((observabler) => {
    xml2js.parseString(
      input,
      { valueProcessors: [parseBooleans], attrValueProcessors: [parseBooleans] },
      (err, result) => {
        if (err) {
          return observabler.error(err)
        }

        result = cloneDeepWith(result, (value: any, key, object) => {
          // if (value === 'true') {
          //   return true
          // }
          // if (value === 'false') {
          //   return false
          // }
          if (isObject(value) && !isArray(value) && key !== '$') {
            forIn(value, (v, key) => {
              if (key === '$') {
                forIn(v, (attr, name) => {
                  value[name] = attr
                })

                delete value[key]
              }
            })
          }
        })

        observabler.next(result)
        observabler.complete()
      }
    )
  })
}

export const XMLA_CONNECTION_KEY = 'XmlaConnection'

/**
 * Update XMLA catalog content in Redis for olap engine.
 * 
 * @param queryBus 
 * @param redisClient 
 * @param model 
 */
export async function updateXmlaCatalogContent(queryBus: QueryBus, redisClient: RedisClientType, model: ISemanticModel) {
  if (
    model.type?.toLowerCase() === 'xmla' &&
    model.dataSource?.type.protocol === 'sql' &&
    model.options?.schema && model.options.schema.cubes?.length
  ) {
    const schema = convertSchemaToXmla(model, model.options.schema)
    const roles = convertSchemaRolesToXmla(model.roles)
    schema.Role = roles
    const catalogContent = buildSchema(schema)

    // const query_runner = createQueryRunnerByType(model.dataSource.type.type, <AdapterBaseOptions><unknown>(model.dataSource.options ?? {}))
    const query_runner = await queryBus.execute(new DataSourceStrategyQuery(model.dataSource.type.type, <AdapterBaseOptions><unknown>(model.dataSource.options ?? {})))
    const name = model.id
    const jdbcConnectionString = query_runner.jdbcUrl(model.catalog)
    await redisClient.sAdd(XMLA_CONNECTION_KEY, name)
    await redisClient.hSet(XMLA_CONNECTION_KEY + ':' + name, {
      _class: 'com.pangolin.olap.repository.XmlaConnection',
      id: name,
      jdbcDriver: query_runner.jdbcDriver,
      jdbcConnectionString,
      description: `Xmla connection for: ${model.dataSource.name}`,
      catalog: model.catalog,
      catalogContent
    })
  }
}

export function applySemanticModelDraft(model: ISemanticModel) {
	if (model.draft) {
		assign(model, omit(model.draft, 'savedAt', 'schema', 'settings', 'dbInitialization', 'tables', 'embedded'))
		model.options = omitBy({
			schema: model.draft.schema,
			settings: model.draft.settings,
			dbInitialization: model.draft.dbInitialization,
			tables: model.draft.tables,
		}, isNil)
	}
	model.draft = null

  return model
}