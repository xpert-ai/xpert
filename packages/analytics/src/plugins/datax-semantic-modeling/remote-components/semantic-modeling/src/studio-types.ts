import { JsonObject, JsonValue } from '../../../../remote-components/shared/runtime'

export type Option = {
	value: string
	label: string
	description?: string
}

export type WorkspaceRow = {
	id: string
	name?: string
	key?: string
	description?: string
	type?: string
	status?: string
	catalog?: string
	dataSourceName?: string
	businessAreaName?: string
	draftVersion?: number
	cubeCount: number
	dimensionCount: number
	publishAt?: string
	updatedAt?: string
}

export type WorkspaceDetail = {
	model: WorkspaceRow
	schema: JsonObject
	checklist: JsonValue[]
}

export type CreateForm = {
	key: string
	name: string
	description: string
	dataSourceId: string
	catalog: string
	type: 'SQL' | 'XMLA'
	businessAreaId: string
	changeSummary: string
}

export type Section =
	| 'relationships'
	| 'overview'
	| 'sources'
	| 'dimensions'
	| 'cubes'
	| 'virtualCubes'
	| 'calculations'
	| 'queryLab'
	| 'members'
	| 'quality'
	| 'security'
	| 'operations'
	| 'settings'
	| 'validation'
	| 'dimensionEditor'
	| 'cubeEditor'
	| 'virtualCubeEditor'
	| 'json'

export type QueryResult = {
	columns: Array<{ name: string; type?: string }>
	rows: JsonObject[]
	rowCount: number
	totalRowCount: number
	truncated: boolean
	mdx?: string
	sql?: string
	durationMs?: number
}

export type QueryRun = {
	id: string
	cubeName: string
	statement: string
	status: 'running' | 'success' | 'error'
	startedAt: string
	durationMs?: number
	rowCount?: number
	error?: string
}
