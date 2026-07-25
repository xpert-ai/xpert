import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { CircleCheckBig, Plus, RefreshCw, Rocket, Save, Search, ShieldCheck } from 'lucide-react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
	installShadcnThemeVars,
	Label,
	Progress,
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Skeleton,
	Textarea,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@xpert-ai/shadcn-ui'
import {
	applyHostTheme,
	buildInitialQuery,
	createRemoteBridge,
	isJsonObject,
	JsonObject,
	JsonValue,
	readArray,
	readData,
	readLocalizedText,
	readNumber,
	readObject,
	readResult,
	readString,
	RemoteContext,
	RemoteHostEvent
} from '../../../../remote-components/shared/runtime'
import { CalculationStudio } from './calculation-studio'
import { CubeModelingStudio } from './cube-modeling-studio'
import { DimensionEditor } from './dimension-editor'
import { createI18n } from './i18n'
import { StudioModulePage } from './module-pages'
import { isStudioModuleSection } from './module-sections'
import { QueryLab } from './query-lab'
import {
	appendItem,
	localized,
	objectCollection,
	readFactTableName,
	replaceAt,
	replaceCollection,
	setObjectValue,
	validateStudioSchema
} from './schema-utils'
import { SourceBrowser, SourceColumn } from './source-browser'
import { useCollapsiblePanel } from './studio-layout'
import { StudioNavigation, StudioNavigationGroup, StudioSectionIcon } from './studio-navigation'
import { AdvancedJson, CreateWorkspaceDialog, Overview, Snapshot, ValidationView } from './studio-panels'
import { CreateForm, Option, QueryResult, QueryRun, Section, WorkspaceDetail } from './studio-types'
import { VirtualCubeEditor } from './virtual-cube-editor'

const bridge = createRemoteBridge('datax-semantic-modeling')

function SemanticModelingApp() {
	const [context, setContext] = React.useState<RemoteContext | null>(null)
	const [query, setQuery] = React.useState<JsonObject>({ page: 1, pageSize: 50, parameters: {} })
	const [models, setModels] = React.useState<Option[]>([])
	const [dataSources, setDataSources] = React.useState<Option[]>([])
	const [projects, setProjects] = React.useState<Option[]>([])
	const [catalogOptions, setCatalogOptions] = React.useState<Option[]>([])
	const [catalogLoading, setCatalogLoading] = React.useState(false)
	const [workspace, setWorkspace] = React.useState<WorkspaceDetail | null>(null)
	const [schema, setSchema] = React.useState<JsonObject>({})
	const [rawSchema, setRawSchema] = React.useState('{}')
	const [dirty, setDirty] = React.useState(false)
	const [section, setSection] = React.useState<Section>('relationships')
	const [tables, setTables] = React.useState<string[]>([])
	const [selectedTable, setSelectedTable] = React.useState('')
	const [columns, setColumns] = React.useState<SourceColumn[]>([])
	const [tableError, setTableError] = React.useState('')
	const [loading, setLoading] = React.useState(false)
	const [metadataLoading, setMetadataLoading] = React.useState(false)
	const [busy, setBusy] = React.useState('')
	const [notice, setNotice] = React.useState<{ error: boolean; text: string } | null>(null)
	const [createOpen, setCreateOpen] = React.useState(false)
	const [publishOpen, setPublishOpen] = React.useState(false)
	const [releaseNotes, setReleaseNotes] = React.useState('')
	const [commandOpen, setCommandOpen] = React.useState(false)
	const [queryResult, setQueryResult] = React.useState<QueryResult | null>(null)
	const [queryRuns, setQueryRuns] = React.useState<QueryRun[]>([])
	const [queryRunning, setQueryRunning] = React.useState(false)
	const navigationPanel = useCollapsiblePanel(88)
	const [createForm, setCreateForm] = React.useState<CreateForm>({
		key: '',
		name: '',
		description: '',
		dataSourceId: '',
		catalog: '',
		type: 'SQL',
		projectId: '',
		businessAreaId: '',
		changeSummary: 'Create semantic model workspace'
	})
	const i18n = React.useMemo(() => createI18n(context?.locale), [context?.locale])
	const issues = React.useMemo(() => validateStudioSchema(schema, context?.locale), [schema, context?.locale])
	const blockingIssues = issues.filter((issue) => issue.level === 'error')

	React.useEffect(
		() =>
			bridge.subscribeContext((nextContext) => {
				applyHostTheme(nextContext.theme)
				installShadcnThemeVars({ density: 'compact' })
				setContext(nextContext)
				const nextQuery = buildInitialQuery(nextContext)
				setQuery(nextQuery)
				void initialize(nextQuery)
			}),
		[]
	)

	React.useEffect(
		() =>
			bridge.subscribeHostEvents((event) => {
				void handleHostEvent(event)
			}),
		[query, dirty]
	)

	React.useEffect(() => {
		bridge.reportResize()
	}, [workspace, schema, tables, notice, createOpen, publishOpen, commandOpen, section, queryResult])

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				setCommandOpen((value) => !value)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	async function initialize(nextQuery: JsonObject) {
		setLoading(true)
		try {
			const [modelOptions, dataSourceOptions, projectOptions] = await Promise.all([
				loadOptions('modelId', nextQuery),
				loadOptions('dataSourceId', nextQuery),
				loadOptions('projectId', nextQuery)
			])
			setModels(modelOptions)
			setDataSources(dataSourceOptions)
			setProjects(projectOptions)
			setCreateForm((current) => ({
				...current,
				projectId: current.projectId || projectOptions[0]?.value || ''
			}))
			const modelId = readString(readObject(nextQuery, 'parameters'), 'modelId') ?? modelOptions[0]?.value
			if (modelId) {
				await selectModel(modelId, nextQuery, false)
			} else {
				setWorkspace(null)
			}
		} catch (error) {
			showError(error)
		} finally {
			setLoading(false)
		}
	}

	async function loadOptions(parameterKey: string, nextQuery: JsonObject) {
		const response = await bridge.requestParameterOptions(parameterKey, {
			parameters: readObject(nextQuery, 'parameters') ?? {}
		})
		return parseOptions(readResult(response))
	}

	async function selectModel(modelId: string, baseQuery = query, guardDirty = true) {
		if (guardDirty && dirty && workspace?.model.id && workspace.model.id !== modelId) {
			setNotice({
				error: true,
				text: localized(
					context?.locale,
					'Save or refresh the current draft before switching models.',
					'切换模型前请先保存或刷新当前草稿。'
				)
			})
			return
		}
		const parameters = { ...(readObject(baseQuery, 'parameters') ?? {}) }
		if (modelId) {
			parameters['modelId'] = modelId
		} else {
			delete parameters['modelId']
		}
		const nextQuery: JsonObject = { ...baseQuery, parameters }
		setQuery(nextQuery)
		setTables([])
		setSelectedTable('')
		setColumns([])
		await loadWorkspace(nextQuery)
	}

	async function loadWorkspace(nextQuery = query) {
		const modelId = readString(readObject(nextQuery, 'parameters'), 'modelId')
		if (!modelId) {
			setWorkspace(null)
			setSchema({})
			setRawSchema('{}')
			setDirty(false)
			return
		}
		setLoading(true)
		try {
			const response = await bridge.requestData(withoutPagination(nextQuery))
			const detail = parseWorkspaceDetail(readData(response))
			const nextSchema = ensureSchemaName(detail.schema, detail.model.key ?? detail.model.name ?? '')
			setWorkspace(detail)
			setSchema(nextSchema)
			setRawSchema(JSON.stringify(nextSchema, null, 2))
			setDirty(false)
			setNotice(null)
			bridge.logger.debug('workspace.loaded', {
				modelId,
				cubeCount: objectCollection(nextSchema, 'cubes').length,
				dimensionCount: objectCollection(nextSchema, 'dimensions').length
			})
		} catch (error) {
			showError(error)
		} finally {
			setLoading(false)
		}
	}

	async function loadTables() {
		const modelId = workspace?.model.id
		if (!modelId) {
			return
		}
		setMetadataLoading(true)
		setTableError('')
		try {
			const response = await bridge.requestData(
				withParameters(query, {
					modelId,
					mode: 'tables'
				})
			)
			const data = readData(response)
			const nextTables = readArray(data, 'items')
				.map((item) => (typeof item === 'string' ? item : ''))
				.filter(Boolean)
			setTables(nextTables)
			const meta = readObject(data, 'meta')
			setTableError(readString(meta, 'error') ?? '')
			if (nextTables[0]) {
				await selectSourceTable(nextTables[0])
			}
		} catch (error) {
			showError(error)
		} finally {
			setMetadataLoading(false)
		}
	}

	async function selectSourceTable(tableName: string) {
		if (!workspace) {
			return
		}
		setSelectedTable(tableName)
		setColumns([])
		setMetadataLoading(true)
		setTableError('')
		try {
			const response = await bridge.requestData(
				withParameters(query, {
					modelId: workspace.model.id,
					mode: 'table_schema',
					tableName
				})
			)
			const data = readData(response)
			setColumns(parseSourceColumns(data['item'] ?? data['items'], tableName))
			setTableError(readString(readObject(data, 'meta'), 'error') ?? '')
		} catch (error) {
			showError(error)
		} finally {
			setMetadataLoading(false)
		}
	}

	function updateSchema(nextSchema: JsonObject) {
		setSchema(nextSchema)
		setRawSchema(JSON.stringify(nextSchema, null, 2))
		setDirty(true)
		setNotice(null)
	}

	function createDimensionFromTable(tableName: string, sourceColumns: SourceColumn[]) {
		const name = artifactName(tableName)
		const dimensions = objectCollection(schema, 'dimensions')
		const nextDimension: JsonObject = {
			name,
			caption: name,
			type: 'StandardDimension',
			hierarchies: [
				{
					name: `${name} Hierarchy`,
					hasAll: true,
					primaryKey: sourceColumns[0]?.name ?? '',
					tables: [{ name: tableName }],
					levels: sourceColumns.slice(0, 20).map((column) => ({
						name: artifactName(column.label ?? column.name),
						column: column.name,
						type: mapColumnType(column),
						uniqueMembers: false
					}))
				}
			]
		}
		updateSchema(replaceCollection(schema, 'dimensions', appendItem(dimensions, nextDimension)))
		setSection('dimensionEditor')
	}

	async function updateCreateForm(nextForm: CreateForm) {
		const dataSourceChanged = nextForm.dataSourceId !== createForm.dataSourceId
		if (!dataSourceChanged) {
			setCreateForm(nextForm)
			return
		}
		const dataSourceId = nextForm.dataSourceId
		setCreateForm({ ...nextForm, catalog: '' })
		setCatalogOptions([])
		if (!dataSourceId) {
			return
		}
		setCatalogLoading(true)
		try {
			const options = await loadOptions('catalog', withParameters(query, { dataSourceId }))
			setCatalogOptions(options)
			setCreateForm((current) =>
				current.dataSourceId === dataSourceId
					? {
							...current,
							catalog: options[0]?.value ?? ''
						}
					: current
			)
		} catch (error) {
			showError(error)
		} finally {
			setCatalogLoading(false)
		}
	}

	function createCubeFromTable(tableName: string, sourceColumns: SourceColumn[]) {
		const name = artifactName(tableName)
		const cubes = objectCollection(schema, 'cubes')
		const measures = sourceColumns
			.filter((column) => isNumericColumn(column))
			.slice(0, 30)
			.map((column) => ({
				name: artifactName(column.label ?? column.name),
				caption: column.label ?? column.comment ?? column.name,
				column: column.name,
				aggregator: 'sum',
				visible: true
			}))
		const nextCube: JsonObject = {
			name,
			caption: name,
			fact: {
				type: 'table',
				table: { name: tableName }
			},
			dimensionUsages: [],
			dimensions: [],
			measures,
			calculatedMembers: [],
			calculations: [],
			parameters: []
		}
		updateSchema(replaceCollection(schema, 'cubes', appendItem(cubes, nextCube)))
		setSection('relationships')
	}

	async function generateCubeMeasuresFromFields(cubeIndex: number) {
		if (!workspace) {
			return
		}
		const cubes = objectCollection(schema, 'cubes')
		const cube = cubes[cubeIndex]
		const tableName = cube ? readFactTableName(cube) : ''
		if (!cube || !tableName) {
			setNotice({
				error: true,
				text: localized(context?.locale, 'Choose a fact table first.', '请先选择事实表。')
			})
			return
		}
		setMetadataLoading(true)
		try {
			const response = await bridge.requestData(
				withParameters(query, {
					modelId: workspace.model.id,
					mode: 'table_schema',
					tableName
				})
			)
			const data = readData(response)
			const sourceColumns = parseSourceColumns(data['item'] ?? data['items'], tableName)
			const measures = objectCollection(cube, 'measures')
			const existingColumns = new Set(
				measures
					.map((measure) => readString(measure, 'column'))
					.filter((value): value is string => Boolean(value))
			)
			const generated = sourceColumns
				.filter((column) => isNumericColumn(column) && !existingColumns.has(column.name))
				.slice(0, 30)
				.map((column) => ({
					name: artifactName(column.label ?? column.name),
					caption: column.label ?? column.comment ?? column.name,
					column: column.name,
					datatype: mapColumnType(column),
					aggregator: 'sum',
					visible: true
				}))
			if (!generated.length) {
				setNotice({
					error: false,
					text: localized(context?.locale, 'No new numeric fields were found.', '没有发现可新增的数值字段。')
				})
				return
			}
			updateSchema(
				replaceCollection(
					schema,
					'cubes',
					replaceAt(cubes, cubeIndex, replaceCollection(cube, 'measures', [...measures, ...generated]))
				)
			)
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					'Measures were generated from numeric fields.',
					'已从数值字段生成度量。'
				)
			})
		} catch (error) {
			showError(error)
		} finally {
			setMetadataLoading(false)
		}
	}

	async function saveDraft() {
		if (!workspace) {
			return
		}
		setBusy('save')
		try {
			const response = await bridge.executeAction('save_draft', {
				targetId: workspace.model.id,
				parameters: readObject(query, 'parameters'),
				input: {
					schemaJson: JSON.stringify(schema),
					baseVersion: workspace.model.draftVersion,
					changeSummary: 'Save semantic model studio draft'
				}
			})
			const result = readResult(response)
			if (result['success'] !== true) {
				throw new Error(readLocalizedText(result['message'], context?.locale ?? 'en-US', i18n.t('failed')))
			}
			setNotice({
				error: false,
				text: readLocalizedText(result['message'], context?.locale ?? 'en-US', i18n.t('success'))
			})
			await loadWorkspace(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function publishModel() {
		if (!workspace || blockingIssues.length) {
			return
		}
		setBusy('publish')
		try {
			const response = await bridge.executeAction('publish', {
				targetId: workspace.model.id,
				parameters: readObject(query, 'parameters'),
				input: {
					releaseNotes,
					changeSummary: 'Publish semantic model workspace'
				}
			})
			const result = readResult(response)
			if (result['success'] !== true) {
				throw new Error(readLocalizedText(result['message'], context?.locale ?? 'en-US', i18n.t('failed')))
			}
			setPublishOpen(false)
			setReleaseNotes('')
			setNotice({
				error: false,
				text: readLocalizedText(result['message'], context?.locale ?? 'en-US', i18n.t('success'))
			})
			await loadWorkspace(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function createWorkspace(event: React.FormEvent) {
		event.preventDefault()
		setBusy('create')
		try {
			const response = await bridge.executeAction('create_workspace', { input: { ...createForm } })
			const result = readResult(response)
			if (result['success'] !== true) {
				throw new Error(readLocalizedText(result['message'], context?.locale ?? 'en-US', i18n.t('failed')))
			}
			const modelId = readString(readObject(result, 'data'), 'id')
			setCreateOpen(false)
			const modelOptions = await loadOptions('modelId', query)
			setModels(modelOptions)
			if (modelId) {
				await selectModel(modelId, query, false)
			}
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	function applyRawSchema() {
		try {
			const parsed: unknown = JSON.parse(rawSchema)
			if (!isJsonObject(parsed)) {
				throw new Error(
					localized(context?.locale, 'Schema JSON must be an object.', 'Schema JSON 必须是对象。')
				)
			}
			updateSchema(parsed)
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					'Advanced JSON applied to the local draft.',
					'高级 JSON 已应用到本地草稿。'
				)
			})
		} catch (error) {
			showError(error)
		}
	}

	async function runQuery(cubeName: string, statement: string) {
		if (!workspace || queryRunning) {
			return
		}
		const id = `${Date.now()}:${cubeName}`
		const startedAt = new Date().toISOString()
		const started = performance.now()
		setQueryRunning(true)
		setQueryRuns((runs) => [{ id, cubeName, statement, status: 'running', startedAt }, ...runs])
		try {
			const response = await bridge.executeAction('execute_query', {
				targetId: workspace.model.id,
				parameters: {
					...(readObject(query, 'parameters') ?? {}),
					modelId: workspace.model.id,
					cubeName
				},
				input: {
					cubeName,
					statement: statement.trim(),
					limit: 200
				}
			})
			const action = readResult(response)
			if (action['success'] !== true) {
				throw new Error(readLocalizedText(action['message'], context?.locale ?? 'en-US', i18n.t('failed')))
			}
			const data = readObject(action, 'data')
			if (!data) {
				throw new Error('Query result payload is missing.')
			}
			const nextResult = parseQueryResult(data)
			setQueryResult(nextResult)
			setQueryRuns((runs) =>
				runs.map((run) =>
					run.id === id
						? {
								...run,
								status: 'success',
								durationMs: Math.round(performance.now() - started),
								rowCount: nextResult.totalRowCount
							}
						: run
				)
			)
			setNotice({
				error: false,
				text: readLocalizedText(action['message'], context?.locale ?? 'en-US', '')
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setQueryRuns((runs) =>
				runs.map((run) =>
					run.id === id
						? {
								...run,
								status: 'error',
								durationMs: Math.round(performance.now() - started),
								error: message
							}
						: run
				)
			)
			showError(error)
		} finally {
			setQueryRunning(false)
		}
	}

	function handleModuleAction(actionId: string) {
		const dimensions = objectCollection(schema, 'dimensions')
		const cubes = objectCollection(schema, 'cubes')
		const virtualCubes = objectCollection(schema, 'virtualCubes')
		if (actionId === 'dimension-create') {
			updateSchema(
				replaceCollection(schema, 'dimensions', [
					...dimensions,
					{
						name: `Dimension ${dimensions.length + 1}`,
						caption: `Dimension ${dimensions.length + 1}`,
						type: 'StandardDimension',
						hierarchies: []
					}
				])
			)
			setSection('dimensionEditor')
			return
		}
		if (actionId === 'dimension-source') {
			setSection('sources')
			if (!tables.length) {
				void loadTables()
			}
			return
		}
		if (actionId === 'dimension-sync') {
			setSection('members')
			return
		}
		if (actionId === 'cube-create') {
			updateSchema(
				replaceCollection(schema, 'cubes', [
					...cubes,
					{
						name: `Cube ${cubes.length + 1}`,
						caption: `Cube ${cubes.length + 1}`,
						dimensionUsages: [],
						dimensions: [],
						measures: [],
						calculatedMembers: [],
						calculations: [],
						parameters: []
					}
				])
			)
			setSection('relationships')
			return
		}
		if (actionId === 'cube-measure' || actionId === 'cube-calculated-member') {
			if (!cubes.length) {
				handleModuleAction('cube-create')
				return
			}
			const cube = cubes[0]
			const key = actionId === 'cube-measure' ? 'measures' : 'calculatedMembers'
			const values = objectCollection(cube, key)
			const nextItem =
				actionId === 'cube-measure'
					? { name: `Measure ${values.length + 1}`, aggregator: 'sum', visible: true }
					: { name: `Calculated Member ${values.length + 1}`, formula: '' }
			updateSchema(
				replaceCollection(
					schema,
					'cubes',
					replaceAt(cubes, 0, replaceCollection(cube, key, appendItem(values, nextItem)))
				)
			)
			setSection('relationships')
			return
		}
		if (actionId === 'virtual-create') {
			updateSchema(
				replaceCollection(schema, 'virtualCubes', [
					...virtualCubes,
					{
						name: `Virtual Cube ${virtualCubes.length + 1}`,
						caption: `Virtual Cube ${virtualCubes.length + 1}`,
						cubeUsages: [],
						virtualCubeDimensions: [],
						virtualCubeMeasures: [],
						calculatedMembers: []
					}
				])
			)
			setSection('virtualCubeEditor')
			return
		}
		if (actionId === 'virtual-validate' || actionId === 'calculation-test' || actionId === 'quality-run') {
			setSection('quality')
			setNotice({
				error: false,
				text: localized(context?.locale, 'Draft validation completed.', '草稿校验已完成。')
			})
			return
		}
		if (actionId === 'calculation-create' || actionId === 'parameter-create') {
			if (!cubes.length) {
				handleModuleAction('cube-create')
				return
			}
			const cube = cubes[0]
			const key = actionId === 'calculation-create' ? 'calculations' : 'parameters'
			const values = objectCollection(cube, key)
			const nextItem =
				actionId === 'calculation-create'
					? { name: `Calculation ${values.length + 1}`, expression: '' }
					: { name: `Parameter ${values.length + 1}`, type: 'String', defaultValue: '' }
			updateSchema(
				replaceCollection(
					schema,
					'cubes',
					replaceAt(cubes, 0, replaceCollection(cube, key, appendItem(values, nextItem)))
				)
			)
			setSection('calculations')
			return
		}
		if (actionId === 'member-sync' || actionId === 'member-upload' || actionId === 'member-test') {
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					'Member retrieval workflow is ready for the selected dimension hierarchy.',
					'已为所选维度层级准备成员检索工作流。'
				)
			})
			return
		}
		if (actionId === 'quality-export') {
			downloadText(
				`${workspace?.model.key ?? 'semantic-model'}-quality.csv`,
				[
					'severity,location,message',
					...issues.map((issue) => csvRow([issue.level, issue.location, issue.message]))
				].join('\n')
			)
			return
		}
		if (actionId === 'role-create') {
			const roles = objectCollection(schema, 'roles')
			updateSchema(
				replaceCollection(schema, 'roles', [
					...roles,
					{
						name: `Role ${roles.length + 1}`,
						modelAccess: 'All',
						grants: [],
						users: [],
						composition: 'Single role'
					}
				])
			)
			return
		}
		if (actionId === 'role-user' || actionId === 'role-simulate') {
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					'Select or create a role, then refine its Cube and member grants in the draft.',
					'请选择或新建角色，然后在草稿中完善 Cube 与成员授权。'
				)
			})
			return
		}
		if (actionId === 'settings-edit') {
			const current = readObject(schema, 'studioSettings') ?? {}
			const visibility = readString(current, 'visibility') === 'Internal' ? 'Private' : 'Internal'
			updateSchema(setObjectValue(schema, 'studioSettings', { ...current, visibility }))
			return
		}
		if (actionId === 'settings-member' || actionId === 'settings-owner') {
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					'Collaborator changes require a workspace member selection from the host organization.',
					'协作成员变更需要从宿主组织中选择成员。'
				)
			})
			return
		}
		if (actionId === 'cache-clear' || actionId === 'cache-view') {
			setNotice({
				error: false,
				text: localized(
					context?.locale,
					actionId === 'cache-clear'
						? 'Cache clear requested for this model.'
						: 'Cache scope is model and Cube aware.',
					actionId === 'cache-clear' ? '已请求清理当前模型缓存。' : '缓存按模型与 Cube 隔离。'
				)
			})
			return
		}
		if (actionId === 'operations-refresh') {
			setQueryRuns((runs) => [...runs])
		}
	}

	async function handleHostEvent(event: RemoteHostEvent) {
		if (event.type !== 'assistant.tool.completed') {
			return
		}
		if (dirty) {
			setNotice({
				error: true,
				text: localized(
					context?.locale,
					'The Agent changed this model while local edits are unsaved. Save or refresh deliberately.',
					'Agent 在本地编辑尚未保存时修改了此模型，请明确选择保存或刷新。'
				)
			})
			return
		}
		await loadWorkspace(query)
	}

	function showError(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		setNotice({ error: true, text: message })
		bridge.logger.error('operation.failed', { message })
	}

	const navGroups: StudioNavigationGroup[] = [
		{
			label: localized(context?.locale, 'Model design', '模型设计'),
			items: [
				{
					key: 'relationships',
					label: localized(context?.locale, 'Cube', '立方体'),
					count: objectCollection(schema, 'cubes').length
				},
				{
					key: 'dimensions',
					label: localized(context?.locale, 'Shared dimensions', '共享维度'),
					count: objectCollection(schema, 'dimensions').length
				},
				{
					key: 'virtualCubes',
					label: localized(context?.locale, 'Virtual cubes', '虚拟 Cube'),
					count: objectCollection(schema, 'virtualCubes').length
				},
				{
					key: 'calculations',
					label: localized(context?.locale, 'Calculations & parameters', '计算与参数'),
					count: countCalculations(schema)
				}
			]
		},
		{
			label: localized(context?.locale, 'Validation & consumption', '验证与消费'),
			items: [
				{ key: 'queryLab', label: 'Query Lab', count: queryRuns.length },
				{
					key: 'members',
					label: localized(context?.locale, 'Members & retrieval', '成员与检索'),
					count: objectCollection(schema, 'dimensions').length
				},
				{
					key: 'quality',
					label: localized(context?.locale, 'Model quality', '模型质量'),
					count: blockingIssues.length
				}
			]
		},
		{
			label: localized(context?.locale, 'Governance & operations', '治理与运维'),
			items: [
				{
					key: 'security',
					label: localized(context?.locale, 'Access control', '访问控制'),
					count: objectCollection(schema, 'roles').length
				},
				{
					key: 'operations',
					label: localized(context?.locale, 'Runs & cache', '运行与缓存'),
					count: queryRuns.length
				},
				{ key: 'settings', label: localized(context?.locale, 'Settings & members', '设置与成员') }
			]
		}
	]
	const auxiliarySection = ['overview', 'sources', 'validation', 'json'].includes(section)
	const activeNavigationSection: Section =
		section === 'dimensionEditor'
			? 'dimensions'
			: section === 'cubes'
				? 'relationships'
				: section === 'virtualCubeEditor'
					? 'virtualCubes'
					: section

	return (
		<TooltipProvider>
			<div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
				<header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
					<div className="mr-1 min-w-40 max-[820px]:min-w-0">
						<div className="text-sm font-semibold">Semantic Model Studio</div>
						<div className="text-xs text-muted-foreground max-[820px]:hidden">
							{localized(context?.locale, 'Governed draft workspace', '受治理的草稿工作空间')}
						</div>
					</div>
					<Select value={workspace?.model.id ?? ''} onValueChange={(value) => void selectModel(value)}>
						<SelectTrigger className="min-w-40 max-w-[320px] flex-1" aria-label={i18n.t('selectModel')}>
							<SelectValue placeholder={i18n.t('selectModel')} />
						</SelectTrigger>
						<SelectContent>
							{models.map((model) => (
								<SelectItem key={model.value} value={model.value}>
									{model.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant="outline"
						size="sm"
						className="max-[880px]:hidden"
						onClick={() => setCommandOpen(true)}
					>
						<Search aria-hidden="true" />
						{localized(context?.locale, 'Search', '搜索')}
						<kbd className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">⌘K</kbd>
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="max-[760px]:hidden"
						onClick={() => setCreateOpen(true)}
					>
						<Plus aria-hidden="true" />
						{i18n.t('newModel')}
					</Button>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon-sm"
								className="max-[920px]:hidden"
								aria-label={i18n.t('refresh')}
								disabled={loading}
								onClick={() => void loadWorkspace()}
							>
								<RefreshCw aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{localized(context?.locale, 'Discard local changes and reload', '放弃本地变更并重新加载')}
						</TooltipContent>
					</Tooltip>
					<div className="flex-1" />
					<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground max-[980px]:hidden">
						<CircleCheckBig
							aria-hidden="true"
							className={dirty ? 'size-3.5 text-warning' : 'size-3.5 text-success'}
						/>
						<span>
							{dirty
								? localized(context?.locale, 'Unsaved changes', '有未保存更改')
								: localized(context?.locale, 'All changes saved', '所有更改已保存')}
						</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="max-[700px]:hidden"
						disabled={!workspace}
						onClick={() => setSection('validation')}
					>
						<ShieldCheck aria-hidden="true" />
						{localized(context?.locale, 'Validate', '验证')}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!workspace || !dirty || busy === 'save'}
						onClick={() => void saveDraft()}
					>
						<Save aria-hidden="true" />
						{busy === 'save' ? localized(context?.locale, 'Saving…', '保存中…') : i18n.t('save')}
					</Button>
					<Button
						size="sm"
						disabled={!workspace || dirty || blockingIssues.length > 0}
						onClick={() => setPublishOpen(true)}
					>
						<Rocket aria-hidden="true" />
						{i18n.t('publish')}
					</Button>
				</header>

				{notice ? (
					<div
						className={
							notice.error
								? 'border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive'
								: 'border-b bg-primary/5 px-4 py-2 text-sm text-foreground'
						}
					>
						{notice.text}
					</div>
				) : null}

				{loading && !workspace ? (
					<div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_280px] gap-3 p-3">
						<Skeleton />
						<Skeleton />
						<Skeleton />
					</div>
				) : !workspace ? (
					<div className="grid min-h-0 flex-1 place-items-center">
						<Card className="max-w-lg">
							<CardHeader>
								<CardTitle>
									{localized(context?.locale, 'Create your semantic workspace', '创建语义工作空间')}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4 text-sm text-muted-foreground">
								<p>
									{localized(
										context?.locale,
										'Select an existing model or create one to map source tables, dimensions, cubes, measures, and virtual cubes.',
										'选择已有模型，或创建新模型以映射数据表、维度、Cube、度量和虚拟 Cube。'
									)}
								</p>
								<Button onClick={() => setCreateOpen(true)}>{i18n.t('newModel')}</Button>
							</CardContent>
						</Card>
					</div>
				) : (
					<ResizablePanelGroup
						id="semantic-studio-shell"
						orientation="horizontal"
						className="min-h-0 flex-1 overflow-hidden"
					>
						<ResizablePanel
							id="semantic-studio-navigation"
							defaultSize={218}
							minSize={176}
							maxSize={320}
							collapsible
							collapsedSize={56}
							groupResizeBehavior="preserve-pixel-size"
							panelRef={navigationPanel.panelRef}
							onResize={navigationPanel.onResize}
						>
							<StudioNavigation
								activeSection={activeNavigationSection}
								collapsed={navigationPanel.collapsed}
								collapseLabel={i18n.t('collapseNavigation')}
								expandLabel={i18n.t('expandNavigation')}
								groups={navGroups}
								modelKey={workspace.model.key ?? ''}
								modelName={workspace.model.name ?? workspace.model.key ?? ''}
								onNavigate={(nextSection) =>
									setSection(
										nextSection === 'dimensions'
											? 'dimensionEditor'
											: nextSection === 'virtualCubes'
												? 'virtualCubeEditor'
												: nextSection
									)
								}
								onToggle={navigationPanel.toggle}
							/>
						</ResizablePanel>
						<ResizableHandle
							id="semantic-studio-navigation-resize"
							withHandle
							className="z-20 hover:bg-ring/40 data-[resize-handle-active]:bg-ring"
						/>
						<ResizablePanel id="semantic-studio-content" minSize="45%">
							<div
								className={
									section === 'relationships' || section === 'cubes'
										? 'h-full min-h-0 overflow-hidden'
										: auxiliarySection
											? 'grid h-full min-h-0 grid-cols-[minmax(0,1fr)_280px] overflow-hidden max-[1100px]:grid-cols-1'
											: 'h-full min-h-0 overflow-hidden'
								}
							>
								<main
									className={
										section === 'relationships' ||
										section === 'cubes' ||
										section === 'queryLab' ||
										section === 'virtualCubeEditor' ||
										section === 'dimensionEditor'
											? 'h-full min-h-0 min-w-0 overflow-hidden'
											: 'min-h-0 min-w-0 overflow-auto'
									}
								>
									{section === 'relationships' || section === 'cubes' ? (
										<CubeModelingStudio
											workspace={workspace}
											schema={schema}
											tables={tables}
											issues={issues}
											locale={context?.locale}
											generatingMeasures={metadataLoading}
											onChange={updateSchema}
											onGenerateMeasures={(cubeIndex) =>
												void generateCubeMeasuresFromFields(cubeIndex)
											}
										/>
									) : (
										<div
											className={
												[
													'dimensions',
													'dimensionEditor',
													'virtualCubes',
													'virtualCubeEditor',
													'calculations',
													'queryLab',
													'members',
													'quality',
													'security',
													'operations',
													'settings'
												].includes(section)
													? section === 'queryLab' ||
														section === 'virtualCubeEditor' ||
														section === 'dimensionEditor'
														? 'h-full min-h-0'
														: 'min-h-full'
													: 'mx-auto max-w-[1500px] p-5'
											}
										>
											{section === 'overview' ? (
												<Overview
													workspace={workspace}
													schema={schema}
													issues={issues}
													locale={context?.locale}
													onChange={updateSchema}
													onNavigate={setSection}
												/>
											) : null}
											{section === 'sources' ? (
												<SourceBrowser
													tables={tables}
													selectedTable={selectedTable}
													columns={columns}
													loading={metadataLoading}
													error={tableError}
													locale={context?.locale}
													onLoadTables={() => void loadTables()}
													onSelectTable={(table) => void selectSourceTable(table)}
													onCreateDimension={createDimensionFromTable}
													onCreateCube={createCubeFromTable}
												/>
											) : null}
											{section === 'dimensionEditor' ? (
												<DimensionEditor
													schema={schema}
													tables={tables}
													locale={context?.locale}
													onChange={updateSchema}
												/>
											) : null}
											{section === 'calculations' ? (
												<CalculationStudio
													schema={schema}
													locale={context?.locale}
													onChange={updateSchema}
													onOpenCubes={() => setSection('relationships')}
													onTestAll={() => handleModuleAction('calculation-test')}
												/>
											) : null}
											{section === 'virtualCubeEditor' ? (
												<VirtualCubeEditor
													schema={schema}
													locale={context?.locale}
													onChange={updateSchema}
												/>
											) : null}
											{section === 'validation' ? (
												<ValidationView issues={issues} locale={context?.locale} />
											) : null}
											{section === 'json' ? (
												<AdvancedJson
													value={rawSchema}
													locale={context?.locale}
													onChange={setRawSchema}
													onApply={applyRawSchema}
												/>
											) : null}
											{isStudioModuleSection(section) ? (
												<StudioModulePage
													section={section}
													workspace={workspace}
													schema={schema}
													issues={issues}
													queryRuns={queryRuns}
													locale={context?.locale}
													onAction={handleModuleAction}
													onRowOpen={() => {
														if (section === 'dimensions') {
															setSection('dimensionEditor')
														} else if (section === 'virtualCubes') {
															setSection('virtualCubeEditor')
														}
													}}
												/>
											) : null}
											{section === 'queryLab' ? (
												<QueryLab
													schema={schema}
													result={queryResult}
													runs={queryRuns}
													running={queryRunning}
													locale={context?.locale}
													onRun={(cubeName, statement) => void runQuery(cubeName, statement)}
												/>
											) : null}
										</div>
									)}
								</main>

								{section !== 'relationships' && auxiliarySection ? (
									<aside className="min-h-0 border-l bg-card/50 max-[1100px]:hidden">
										<ScrollArea className="h-full">
											<div className="space-y-4 p-4">
												<div>
													<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
														{localized(context?.locale, 'Release readiness', '发布就绪度')}
													</div>
													<div className="mt-2 flex items-end justify-between">
														<span className="text-2xl font-semibold">
															{Math.max(0, 100 - blockingIssues.length * 20)}
														</span>
														<span className="text-xs text-muted-foreground">/ 100</span>
													</div>
													<Progress
														className="mt-2"
														value={Math.max(0, 100 - blockingIssues.length * 20)}
													/>
												</div>
												<Separator />
												<Snapshot
													schema={schema}
													workspace={workspace}
													locale={context?.locale}
												/>
												<Separator />
												<div className="space-y-2">
													<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
														{localized(context?.locale, 'Validation', '校验')}
													</div>
													{issues.slice(0, 6).map((issue, index) => (
														<button
															key={`${issue.location}:${index}`}
															type="button"
															className="block w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-muted"
															onClick={() => setSection('validation')}
														>
															<div
																className={
																	issue.level === 'error'
																		? 'font-medium text-destructive'
																		: issue.level === 'success'
																			? 'font-medium text-primary'
																			: 'font-medium'
																}
															>
																{issue.message}
															</div>
															<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
																{issue.location}
															</div>
														</button>
													))}
												</div>
											</div>
										</ScrollArea>
									</aside>
								) : null}
							</div>
						</ResizablePanel>
					</ResizablePanelGroup>
				)}

				<CreateWorkspaceDialog
					open={createOpen}
					form={createForm}
					dataSources={dataSources}
					projects={projects}
					catalogOptions={catalogOptions}
					catalogLoading={catalogLoading}
					busy={busy === 'create'}
					locale={context?.locale}
					onOpenChange={setCreateOpen}
					onChange={(form) => void updateCreateForm(form)}
					onSubmit={(event) => void createWorkspace(event)}
				/>

				<AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
					<AlertDialogContent className="sm:max-w-xl">
						<AlertDialogHeader>
							<AlertDialogTitle>{i18n.t('publishModel')}</AlertDialogTitle>
							<AlertDialogDescription>{i18n.t('publishDescription')}</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
							<div className="font-medium">
								{blockingIssues.length
									? localized(
											context?.locale,
											`${blockingIssues.length} blocking issue(s) must be resolved.`,
											`仍有 ${blockingIssues.length} 个阻塞项需要处理。`
										)
									: localized(
											context?.locale,
											'The current draft passed the publish gate.',
											'当前草稿已通过发布门禁。'
										)}
							</div>
							<div className="text-amber-800 dark:text-amber-200">
								{localized(
									context?.locale,
									'Publishing updates the governed runtime contract used by UI and Agent queries.',
									'发布后将更新前端 UI 与 Agent 查询共同使用的受治理运行时契约。'
								)}
							</div>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="semantic-release-notes">{i18n.t('releaseNotes')}</Label>
							<Textarea
								id="semantic-release-notes"
								value={releaseNotes}
								onChange={(event) => setReleaseNotes(event.currentTarget.value)}
							/>
						</div>
						<div className="rounded-md border">
							<div className="border-b px-3 py-2 text-xs font-medium">
								{localized(context?.locale, 'Version summary', '本次版本摘要')}
							</div>
							<div className="grid grid-cols-3 divide-x text-center">
								<div className="p-3">
									<div className="text-lg font-semibold">
										{objectCollection(schema, 'dimensions').length}
									</div>
									<div className="text-[10px] text-muted-foreground">
										{localized(context?.locale, 'Dimensions', '共享维度')}
									</div>
								</div>
								<div className="p-3">
									<div className="text-lg font-semibold">
										{objectCollection(schema, 'cubes').length}
									</div>
									<div className="text-[10px] text-muted-foreground">Cube</div>
								</div>
								<div className="p-3">
									<div className="text-lg font-semibold">{countCalculations(schema)}</div>
									<div className="text-[10px] text-muted-foreground">
										{localized(context?.locale, 'Calculations', '计算项')}
									</div>
								</div>
							</div>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel>{i18n.t('cancel')}</AlertDialogCancel>
							<AlertDialogAction disabled={busy === 'publish'} onClick={() => void publishModel()}>
								{i18n.t('publish')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<CommandDialog
					open={commandOpen}
					onOpenChange={setCommandOpen}
					title={localized(context?.locale, 'Studio command palette', 'Studio 命令面板')}
					description={localized(
						context?.locale,
						'Navigate to a semantic modeling capability.',
						'快速前往语义建模功能。'
					)}
				>
					<CommandInput
						placeholder={localized(
							context?.locale,
							'Search modeling, query, governance…',
							'搜索建模、查询、治理功能…'
						)}
					/>
					<CommandList>
						<CommandEmpty>
							{localized(context?.locale, 'No command found.', '没有匹配的命令。')}
						</CommandEmpty>
						{navGroups.map((group) => (
							<CommandGroup key={group.label} heading={group.label}>
								{group.items.map((item) => (
									<CommandItem
										key={item.key}
										value={`${group.label} ${item.label}`}
										onSelect={() => {
											setSection(item.key)
											setCommandOpen(false)
										}}
									>
										<span className="grid size-6 place-items-center rounded border bg-background text-muted-foreground">
											<StudioSectionIcon section={item.key} className="size-3.5" />
										</span>
										<span>{item.label}</span>
										<CommandShortcut>
											{typeof item.count === 'number' ? item.count : ''}
										</CommandShortcut>
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</CommandDialog>
			</div>
		</TooltipProvider>
	)
}

function parseOptions(result: JsonObject): Option[] {
	return readArray(result, 'items')
		.filter(isJsonObject)
		.map((item) => ({
			value: readScalarString(item, 'value'),
			label: readString(item, 'label') ?? readScalarString(item, 'value'),
			description: readString(item, 'description')
		}))
		.filter((item) => item.value)
}

function parseWorkspaceDetail(data: JsonObject): WorkspaceDetail {
	const item = readObject(data, 'item')
	const model = readObject(item, 'model')
	const draft = readObject(item, 'draft')
	if (!item || !model || !draft) {
		throw new Error('Semantic model workspace payload is incomplete.')
	}
	return {
		model: {
			id: readScalarString(model, 'id'),
			name: readString(model, 'name'),
			key: readString(model, 'key'),
			description: readString(model, 'description'),
			type: readString(model, 'type'),
			status: readString(model, 'status'),
			catalog: readString(model, 'catalog'),
			dataSourceName: readString(model, 'dataSourceName'),
			businessAreaName: readString(model, 'businessAreaName'),
			draftVersion: readNumber(model, 'draftVersion'),
			cubeCount: readNumber(model, 'cubeCount') ?? 0,
			dimensionCount: readNumber(model, 'dimensionCount') ?? 0,
			publishAt: readDateString(model, 'publishAt'),
			updatedAt: readDateString(model, 'updatedAt')
		},
		schema: readObject(draft, 'schema') ?? {},
		checklist: readArray(item, 'checklist')
	}
}

function parseSourceColumns(value: JsonValue | undefined, tableName: string): SourceColumn[] {
	const tables = Array.isArray(value) ? value.filter(isJsonObject) : isJsonObject(value) ? [value] : []
	const table = tables.find((item) => readString(item, 'name') === tableName) ?? tables[0]
	return readArray(table, 'columns')
		.filter(isJsonObject)
		.map((column) => ({
			name: readString(column, 'name') ?? '',
			label: readString(column, 'label'),
			type: readString(column, 'type'),
			dataType: readString(column, 'dataType'),
			nullable: column['nullable'] === true,
			comment: readString(column, 'comment')
		}))
		.filter((column) => column.name)
}

function parseQueryResult(data: JsonObject): QueryResult {
	return {
		columns: readArray(data, 'columns')
			.filter(isJsonObject)
			.map((column) => ({
				name: readString(column, 'name') ?? '',
				type: readString(column, 'type')
			}))
			.filter((column) => column.name),
		rows: readArray(data, 'rows').filter(isJsonObject),
		rowCount: readNumber(data, 'rowCount') ?? 0,
		totalRowCount: readNumber(data, 'totalRowCount') ?? 0,
		truncated: data['truncated'] === true,
		mdx: readString(data, 'mdx'),
		sql: readString(data, 'sql'),
		durationMs: readNumber(data, 'durationMs')
	}
}

function ensureSchemaName(schema: JsonObject, fallback: string) {
	return readString(schema, 'name') ? schema : setObjectValue(schema, 'name', fallback)
}

function withoutPagination(query: JsonObject): JsonObject {
	const output = { ...query }
	delete output['page']
	delete output['pageSize']
	return output
}

function withParameters(query: JsonObject, parameters: JsonObject): JsonObject {
	return withoutPagination({
		...query,
		parameters: {
			...(readObject(query, 'parameters') ?? {}),
			...parameters
		}
	})
}

function artifactName(value: string) {
	return value
		.split(/[._\-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}

function countCalculations(schema: JsonObject) {
	return objectCollection(schema, 'cubes').reduce(
		(total, cube) =>
			total +
			objectCollection(cube, 'calculations').length +
			objectCollection(cube, 'calculatedMembers').length +
			objectCollection(cube, 'parameters').length,
		0
	)
}

function downloadText(filename: string, value: string) {
	const url = URL.createObjectURL(new Blob([value], { type: 'text/csv;charset=utf-8' }))
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	URL.revokeObjectURL(url)
}

function csvRow(values: string[]) {
	return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')
}

function mapColumnType(column: SourceColumn) {
	const value = `${column.type ?? ''} ${column.dataType ?? ''}`.toLowerCase()
	if (/bool/.test(value)) {
		return 'Boolean'
	}
	if (/date|time/.test(value)) {
		return /timestamp|datetime/.test(value) ? 'Timestamp' : 'Date'
	}
	if (/int/.test(value)) {
		return 'Integer'
	}
	if (/number|numeric|decimal|float|double|real/.test(value)) {
		return 'Numeric'
	}
	return 'String'
}

function isNumericColumn(column: SourceColumn) {
	return /number|numeric|decimal|float|double|real|int/.test(
		`${column.type ?? ''} ${column.dataType ?? ''}`.toLowerCase()
	)
}

function readScalarString(input: JsonObject, key: string) {
	const value = input[key]
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}

function readDateString(input: JsonObject, key: string) {
	const value = input[key]
	return typeof value === 'string' ? value : undefined
}

const rootElement = document.getElementById('root')
if (!rootElement) {
	throw new Error('Remote component root was not found.')
}
createRoot(rootElement).render(<SemanticModelingApp />)
bridge.ready()
