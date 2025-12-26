import { Logger } from '@nestjs/common'
import path from 'path'
import fs from 'fs';
import yaml from 'yaml'
import Ajv from 'ajv'
import schemaDraft04 from 'ajv/dist/refs/json-schema-draft-06.json'
import { JSONSchema4 } from 'json-schema'


export function loadYamlFile<T>(
	filePath: string,
	logger?: Logger,
	ignoreError = true, 
	defaultValue: T = {} as T
  ): T {
	try {
	  const fileContent = fs.readFileSync(filePath, 'utf-8');
	  try {
		const yamlContent = yaml.parse(fileContent) as T;
		return yamlContent || defaultValue;
	  } catch (e) {
		throw new Error(`Failed to load YAML file ${filePath}: ${e}`);
	  }
	} catch (e) {
	  if (ignoreError) {
		logger?.debug(`Error loading YAML file: ${e}`);
		return defaultValue;
	  } else {
		throw e;
	  }
	}
}

/**
 * Get the mapping from name to index from a YAML file
 * 
 * @param folderPath
 * @param fileName the YAML file name, default to '_position.yaml'
 * @return a dict with name as key and index as value
 */
export function getPositionMap(folderPath: string, fileName = '_position.yaml', logger?: Logger): Record<string, number> {
	const positions = getPositionList(folderPath, fileName, logger)
	return positions.reduce((acc: Record<string, number>, name: string, index: number) => {
		acc[name] = index
		return acc
	}, {})
}

export function getPositionList(folderPath: string, fileName = '_position.yaml', logger?: Logger): string[] {
	const positionFilePath = path.join(folderPath, fileName)
	const yamlContent = loadYamlFile<string[]>(positionFilePath, logger, true, [])
	const positions = yamlContent
		?.filter((item: any) => item && typeof item === 'string' && item.trim())
		.map((item: string) => item.trim())
	return positions
}

export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err && (err.name === "AggregateError" || err.constructor.name === "AggregateError")) {
    return err.errors.map((_) => getErrorMessage(_)).join('\n\n')
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if(err?.message) {
    error = err?.message
  } else if (err) {
    // If there is no other way, convert it to JSON string
    error = JSON.stringify(err)
  }

  return error
}

export class JsonSchemaValidator {
  private ajv: Ajv

  constructor() {
    this.ajv = new Ajv({ strict: false })
    this.ajv.addMetaSchema(schemaDraft04)
  }

  parseAndValidate(schemaStr?: string): JSONSchema4 | undefined {
    if (!schemaStr) return undefined

    let schema: unknown
    try {
      schema = JSON.parse(schemaStr)
    } catch {
      throw new Error('Schema is not valid JSON')
    }

    const validate = this.ajv.getSchema(schemaDraft04.$id)
    if (!validate(schema)) {
      throw new Error(
        'Invalid JSON Schema: ' +
        this.ajv.errorsText(validate.errors)
      )
    }

    return schema as JSONSchema4
  }
}
