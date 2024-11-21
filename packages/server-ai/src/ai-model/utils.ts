import { loadYamlFile } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import * as path from 'path'

/**
 * Get the mapping from name to index from a YAML file
 * 
 * @param folderPath
 * @param fileName the YAML file name, default to '_position.yaml'
 * @return a dict with name as key and index as value
 */
export function getPositionMap(folderPath: string, fileName = '_position.yaml', logger?: Logger): Record<string, number> {
	const positionFilePath = path.join(folderPath, fileName)
	const yamlContent = loadYamlFile<string[]>(positionFilePath, logger, true, [])
	const positions = yamlContent
		?.filter((item: any) => item && typeof item === 'string' && item.trim())
		.map((item: string) => item.trim())
	return positions.reduce((acc: Record<string, number>, name: string, index: number) => {
		acc[name] = index
		return acc
	}, {})
}
