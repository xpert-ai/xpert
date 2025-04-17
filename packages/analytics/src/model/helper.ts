import {
  camelCase,
  cloneDeep,
  cloneDeepWith,
  forIn,
  isArray,
  isNil,
  isObject,
  isString,
} from 'lodash'
import { Observable } from 'rxjs'
import * as xml2js from 'xml2js'
import { convertSchemaRolesToXmla, convertSchemaToXmla } from './mdx'
import { AdapterBaseOptions, createQueryRunnerByType } from '@metad/adapter'
import { RedisClientType } from 'redis'
import { ISemanticModel } from '@metad/contracts'


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

export async function updateXmlaCatalogContent(redisClient: RedisClientType, model: ISemanticModel) {
  if (
    model.type?.toLowerCase() === 'xmla' &&
    model.dataSource?.type.protocol === 'sql' &&
    model.options?.schema && model.options.schema.cubes?.length
  ) {
    const schema = convertSchemaToXmla(model, model.options.schema)
    const roles = convertSchemaRolesToXmla(model.roles)
    schema.Role = roles
    const catalogContent = buildSchema(schema)

    const query_runner = createQueryRunnerByType(model.dataSource.type.type, <AdapterBaseOptions><unknown>(model.dataSource.options ?? {}))
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