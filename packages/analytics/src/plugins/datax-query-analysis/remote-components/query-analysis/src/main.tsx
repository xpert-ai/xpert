import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	installShadcnThemeVars,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
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
	readLocalizedText,
	readNumber,
	readObject,
	readResult,
	readString,
	RemoteContext,
	RemoteHostEvent
} from '../../../../remote-components/shared/runtime'
import { createI18n } from './i18n'

type Option = {
	value: string
	label: string
	description?: string
}

type QueryResult = {
	columns: Array<{ name: string; type?: string }>
	rows: JsonObject[]
	rowCount: number
	totalRowCount: number
	truncated: boolean
	mdx?: string
	sql?: string
	durationMs?: number
}

const bridge = createRemoteBridge('datax-query-analysis')
const DEFAULT_QUERY = `SELECT
  {[Measures].Members} ON COLUMNS
FROM [Cube]`

function QueryAnalysisApp() {
	const [context, setContext] = React.useState<RemoteContext | null>(null)
	const [query, setQuery] = React.useState<JsonObject>({ page: 1, pageSize: 200, parameters: {} })
	const [models, setModels] = React.useState<Option[]>([])
	const [cubes, setCubes] = React.useState<Option[]>([])
	const [statement, setStatement] = React.useState('')
	const [result, setResult] = React.useState<QueryResult | null>(null)
	const [loading, setLoading] = React.useState(false)
	const [notice, setNotice] = React.useState<{ error: boolean; text: string } | null>(null)
	const i18n = React.useMemo(() => createI18n(context?.locale), [context?.locale])

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
		[query]
	)

	React.useEffect(() => {
		bridge.reportResize()
	}, [models, cubes, result, loading, notice])

	async function initialize(nextQuery: JsonObject) {
		setLoading(true)
		try {
			const modelOptions = await loadOptions('modelId', nextQuery)
			setModels(modelOptions)
			const parameters = readObject(nextQuery, 'parameters') ?? {}
			const modelId = readString(parameters, 'modelId') ?? modelOptions[0]?.value
			const nextStatement = readString(parameters, 'statement') ?? ''
			setStatement(nextStatement)
			if (!modelId) {
				return
			}
			const withModel = withParameter(nextQuery, 'modelId', modelId)
			const cubeOptions = await loadOptions('cubeName', withModel)
			setCubes(cubeOptions)
			const cubeName = readString(parameters, 'cubeName') ?? cubeOptions[0]?.value
			const readyQuery = cubeName ? withParameter(withModel, 'cubeName', cubeName) : withModel
			setQuery(readyQuery)
			if (nextStatement && parameters['autoRun'] === true && cubeName) {
				await executeQuery(readyQuery, nextStatement)
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

	async function selectModel(modelId: string) {
		let nextQuery = withParameter(query, 'modelId', modelId)
		nextQuery = withParameter(nextQuery, 'cubeName', '')
		setQuery(nextQuery)
		setResult(null)
		setNotice(null)
		if (!modelId) {
			setCubes([])
			return
		}
		try {
			const cubeOptions = await loadOptions('cubeName', nextQuery)
			setCubes(cubeOptions)
			if (cubeOptions[0]?.value) {
				nextQuery = withParameter(nextQuery, 'cubeName', cubeOptions[0].value)
				setQuery(nextQuery)
			}
		} catch (error) {
			showError(error)
		}
	}

	function selectCube(cubeName: string) {
		setQuery(withParameter(query, 'cubeName', cubeName))
		setResult(null)
		setNotice(null)
	}

	async function executeQuery(baseQuery = query, statementValue = statement) {
		const parameters = readObject(baseQuery, 'parameters') ?? {}
		const modelId = readString(parameters, 'modelId')
		const cubeName = readString(parameters, 'cubeName')
		if (!modelId || !cubeName) {
			setNotice({ error: true, text: i18n.t('selectContext') })
			return
		}
		if (!statementValue.trim()) {
			setNotice({ error: true, text: i18n.t('statementRequired') })
			return
		}

		setLoading(true)
		setNotice(null)
		try {
			const response = await bridge.executeAction('execute', {
				parameters: { ...parameters, modelId, cubeName },
				input: { statement: statementValue.trim(), limit: 200 }
			})
			const action = readResult(response)
			if (action['success'] !== true) {
				throw new Error(readLocalizedText(action['message'], context?.locale ?? 'en-US', i18n.t('failed')))
			}
			const data = readObject(action, 'data')
			if (!data) {
				throw new Error('Query result payload is missing.')
			}
			setResult(parseQueryResult(data))
			setNotice({
				error: false,
				text: readLocalizedText(action['message'], context?.locale ?? 'en-US', '')
			})
			setQuery(withParameter(baseQuery, 'statement', statementValue.trim()))
			bridge.logger.info('query.completed', {
				modelId,
				cubeName,
				rowCount: readNumber(data, 'totalRowCount')
			})
		} catch (error) {
			showError(error)
			setResult(null)
		} finally {
			setLoading(false)
		}
	}

	async function handleHostEvent(event: RemoteHostEvent) {
		if (event.type !== 'assistant.tool.completed' || event.toolName !== 'datax_query_execute') {
			return
		}
		const output = readObject(event.data, 'output') ?? event.data
		const modelId = readString(output, 'modelId')
		const cubeName = readString(output, 'cubeName')
		const mdx = readString(output, 'mdx')
		if (!modelId || !cubeName || !mdx) {
			return
		}
		let nextQuery = withParameter(query, 'modelId', modelId)
		nextQuery = withParameter(nextQuery, 'cubeName', cubeName)
		setStatement(mdx)
		setQuery(nextQuery)
		setCubes(await loadOptions('cubeName', nextQuery))
		await executeQuery(nextQuery, mdx)
	}

	function showError(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		setNotice({ error: true, text: message })
		bridge.logger.error('query.failed', { message })
	}

	const parameters = readObject(query, 'parameters') ?? {}
	const selectedModelId = readString(parameters, 'modelId') ?? ''
	const selectedCubeName = readString(parameters, 'cubeName') ?? ''

	return (
		<TooltipProvider>
			<div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
				<header className="flex min-h-14 flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
					<div className="mr-2 min-w-40">
						<div className="text-sm font-semibold">Query Analysis</div>
						<div className="text-xs text-muted-foreground">MDX workbench · real data</div>
					</div>
					<Select value={selectedModelId} onValueChange={(value) => void selectModel(value)}>
						<SelectTrigger className="w-[260px]" aria-label={i18n.t('model')}>
							<SelectValue placeholder={i18n.t('noModel')} />
						</SelectTrigger>
						<SelectContent>
							{models.map((model) => (
								<SelectItem key={model.value} value={model.value}>
									{model.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select value={selectedCubeName} onValueChange={selectCube} disabled={!selectedModelId}>
						<SelectTrigger className="w-[220px]" aria-label={i18n.t('cube')}>
							<SelectValue placeholder={i18n.t('noCube')} />
						</SelectTrigger>
						<SelectContent>
							{cubes.map((cube) => (
								<SelectItem key={cube.value} value={cube.value}>
									{cube.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="outline" onClick={() => setStatement(DEFAULT_QUERY)}>
								Template
							</Button>
						</TooltipTrigger>
						<TooltipContent>Insert a starter MDX statement</TooltipContent>
					</Tooltip>
					<Button disabled={loading} onClick={() => void executeQuery()}>
						{loading ? i18n.t('loading') : i18n.t('run')}
					</Button>
				</header>

				<div className="grid min-h-0 flex-1 grid-rows-[minmax(160px,34vh)_auto_minmax(0,1fr)]">
					<div className="border-b p-3">
						<Textarea
							className="h-full min-h-36 resize-none font-mono text-[13px] leading-6"
							aria-label={i18n.t('editor')}
							spellCheck={false}
							placeholder={DEFAULT_QUERY}
							value={statement}
							onChange={(event) => setStatement(event.currentTarget.value)}
						/>
					</div>

					<div className="flex min-h-10 items-center gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground">
						{notice ? (
							<span className={notice.error ? 'text-destructive' : 'text-foreground'}>{notice.text}</span>
						) : (
							<span>{i18n.t('empty')}</span>
						)}
						{result ? (
							<>
								<Badge variant="secondary">{i18n.t('rowCount', { count: result.totalRowCount })}</Badge>
								{result.truncated ? (
									<Badge variant="outline">{i18n.t('truncated', { count: result.rowCount })}</Badge>
								) : null}
								{typeof result.durationMs === 'number' ? (
									<Badge variant="outline">{result.durationMs} ms</Badge>
								) : null}
							</>
						) : null}
					</div>

					<Tabs defaultValue="results" className="flex min-h-0 flex-col">
						<div className="flex items-center border-b px-3">
							<TabsList className="h-10 bg-transparent">
								<TabsTrigger value="results">Results</TabsTrigger>
								<TabsTrigger value="sql" disabled={!result?.sql}>
									Generated SQL
								</TabsTrigger>
								<TabsTrigger value="mdx" disabled={!result?.mdx}>
									Normalized MDX
								</TabsTrigger>
							</TabsList>
						</div>
						<TabsContent value="results" className="mt-0 min-h-0 flex-1 overflow-hidden">
							{loading && !result ? (
								<div className="space-y-2 p-4">
									{Array.from({ length: 6 }, (_, index) => (
										<Skeleton key={index} className="h-8 w-full" />
									))}
								</div>
							) : !result || !result.rows.length ? (
								<div className="grid h-full place-items-center text-sm text-muted-foreground">
									{i18n.t('empty')}
								</div>
							) : (
								<ScrollArea className="h-full">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-card">
											<TableRow>
												{result.columns.map((column) => (
													<TableHead key={column.name} className="min-w-40 whitespace-nowrap">
														<div className="font-medium">{column.name}</div>
														<div className="text-[10px] font-normal text-muted-foreground">
															{column.type ?? 'value'}
														</div>
													</TableHead>
												))}
											</TableRow>
										</TableHeader>
										<TableBody>
											{result.rows.map((row, rowIndex) => (
												<TableRow key={rowIndex}>
													{result.columns.map((column) => (
														<TableCell
															className="max-w-[440px] truncate whitespace-nowrap font-mono text-xs"
															key={column.name}
														>
															{i18n.formatValue(row[column.name])}
														</TableCell>
													))}
												</TableRow>
											))}
										</TableBody>
									</Table>
								</ScrollArea>
							)}
						</TabsContent>
						<TabsContent value="sql" className="mt-0 min-h-0 flex-1 p-3">
							<Card className="h-full">
								<CardHeader className="py-3">
									<CardTitle className="text-sm">Generated SQL</CardTitle>
								</CardHeader>
								<CardContent>
									<pre className="whitespace-pre-wrap font-mono text-xs leading-6">{result?.sql}</pre>
								</CardContent>
							</Card>
						</TabsContent>
						<TabsContent value="mdx" className="mt-0 min-h-0 flex-1 p-3">
							<Card className="h-full">
								<CardHeader className="py-3">
									<CardTitle className="text-sm">Normalized MDX</CardTitle>
								</CardHeader>
								<CardContent>
									<pre className="whitespace-pre-wrap font-mono text-xs leading-6">{result?.mdx}</pre>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
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

function parseQueryResult(data: JsonObject): QueryResult {
	const audit = readObject(data, 'audit')
	return {
		columns: readArray(data, 'columns')
			.filter(isJsonObject)
			.map((column) => ({ name: readString(column, 'name') ?? '', type: readString(column, 'type') }))
			.filter((column) => column.name),
		rows: readArray(data, 'rows').filter(isJsonObject),
		rowCount: readNumber(data, 'rowCount') ?? 0,
		totalRowCount: readNumber(data, 'totalRowCount') ?? readNumber(data, 'rowCount') ?? 0,
		truncated: data['truncated'] === true,
		mdx: readString(data, 'mdx'),
		sql: readString(data, 'sql'),
		durationMs: readNumber(audit, 'durationMs')
	}
}

function withParameter(query: JsonObject, key: string, value: JsonValue): JsonObject {
	const parameters = { ...(readObject(query, 'parameters') ?? {}) }
	if (value === '' || value === null || value === undefined) {
		delete parameters[key]
	} else {
		parameters[key] = value
	}
	return { ...query, parameters }
}

function readScalarString(input: JsonObject, key: string) {
	const value = input[key]
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}

const rootElement = document.getElementById('root')
if (!rootElement) {
	throw new Error('Remote component root was not found.')
}
createRoot(rootElement).render(<QueryAnalysisApp />)
bridge.ready()
