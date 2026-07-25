import * as React from 'react'
import {
	Badge,
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { Clock3, Database, Play, Rows3, SquareTerminal } from 'lucide-react'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { MonacoCodeEditor } from './monaco-code-editor'
import { createQueryLabI18n, QueryLabI18n } from './query-lab-i18n'
import { objectCollection } from './schema-utils'
import { QueryResult, QueryRun } from './studio-types'

export function QueryLab(props: {
	schema: JsonObject
	result: QueryResult | null
	runs: QueryRun[]
	running: boolean
	locale?: string
	onRun(cubeName: string, statement: string): void
}) {
	const i18n = React.useMemo(() => createQueryLabI18n(props.locale), [props.locale])
	const cubeNames = objectCollection(props.schema, 'cubes')
		.map((cube) => readString(cube, 'name') ?? readString(cube, 'caption') ?? '')
		.filter(Boolean)
	const cubeNamesKey = cubeNames.join('|')
	const [cubeName, setCubeName] = React.useState(cubeNames[0] ?? '')
	const [statement, setStatement] = React.useState(() => defaultStatement(cubeNames[0] ?? 'Cube'))
	const templates = React.useMemo(
		() => buildQueryTemplates(props.schema, cubeName, i18n),
		[props.schema, cubeName, i18n]
	)

	React.useEffect(() => {
		if (!cubeNames.length) {
			setCubeName('')
			return
		}
		if (!cubeNames.includes(cubeName)) {
			setCubeName(cubeNames[0])
			setStatement(defaultStatement(cubeNames[0]))
		}
	}, [cubeName, cubeNamesKey])

	function selectCube(nextCubeName: string) {
		const replaceDefaultStatement = statement === defaultStatement(cubeName)
		setCubeName(nextCubeName)
		if (replaceDefaultStatement) {
			setStatement(defaultStatement(nextCubeName))
		}
	}

	function runQuery(nextStatement = statement) {
		const normalized = nextStatement.trim()
		if (!cubeName || !normalized || props.running) {
			return
		}
		setStatement(nextStatement)
		props.onRun(cubeName, normalized)
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-testid="query-lab">
			<header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card/60 px-4">
				<div className="flex min-w-0 items-center gap-2.5">
					<div className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-primary">
						<SquareTerminal className="size-4" aria-hidden="true" />
					</div>
					<h1 className="truncate text-sm font-semibold">{i18n.t('title')}</h1>
					<Badge variant="secondary" className="hidden h-5 px-1.5 text-[10px] sm:inline-flex">
						{i18n.t('publishedRuntime')}
					</Badge>
				</div>
				<div className="flex min-w-0 items-center gap-2">
					<Select
						onValueChange={(templateId) => {
							const template = templates.find((item) => item.id === templateId)
							if (template) {
								setStatement(template.statement)
							}
						}}
					>
						<SelectTrigger
							className="hidden h-8 w-44 text-xs md:flex"
							aria-label={i18n.t('queryTemplate')}
							disabled={!templates.length}
						>
							<SelectValue placeholder={i18n.t('queryTemplate')} />
						</SelectTrigger>
						<SelectContent>
							{templates.map((template) => (
								<SelectItem key={template.id} value={template.id}>
									{template.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select value={cubeName} onValueChange={selectCube}>
						<SelectTrigger className="h-8 w-40 text-xs" aria-label={i18n.t('cube')}>
							<Database className="size-3.5 text-muted-foreground" aria-hidden="true" />
							<SelectValue placeholder={i18n.t('chooseCube')} />
						</SelectTrigger>
						<SelectContent>
							{cubeNames.map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						className="h-8 gap-1.5 px-3"
						disabled={!cubeName || !statement.trim() || props.running}
						onClick={() => runQuery()}
					>
						<Play className="size-3.5 fill-current" aria-hidden="true" />
						{props.running ? i18n.t('running') : i18n.t('runQuery')}
					</Button>
				</div>
			</header>

			<div className="grid min-h-0 flex-1 grid-rows-[minmax(190px,34%)_minmax(0,66%)]">
				<section className="flex min-h-0 flex-col border-b" aria-label={i18n.t('mdx')}>
					<div className="flex h-9 shrink-0 items-center justify-between border-b bg-muted/20 px-3">
						<div className="flex items-center gap-2">
							<span className="text-xs font-semibold">{i18n.t('mdx')}</span>
							<span className="text-[10px] text-muted-foreground">{i18n.t('editorHint')}</span>
						</div>
						<div className="font-mono text-[10px] tabular-nums text-muted-foreground">
							{statement.split('\n').length}:{statement.length}
						</div>
					</div>
					<div className="min-h-0 flex-1">
						<MonacoCodeEditor
							value={statement}
							language="mdx"
							ariaLabel={i18n.t('mdx')}
							onChange={setStatement}
							onExecute={runQuery}
						/>
					</div>
				</section>

				<QueryOutput result={props.result} runs={props.runs} running={props.running} i18n={i18n} />
			</div>
		</div>
	)
}

function QueryOutput(props: { result: QueryResult | null; runs: QueryRun[]; running: boolean; i18n: QueryLabI18n }) {
	return (
		<Tabs defaultValue="result" className="grid min-h-0 grid-rows-[40px_minmax(0,1fr)] gap-0">
			<div className="flex items-center justify-between border-b bg-card/40 px-3">
				<TabsList variant="line" className="h-9">
					<TabsTrigger value="result" className="h-9 gap-1.5 px-2.5 text-xs">
						<Rows3 className="size-3.5" aria-hidden="true" />
						{props.i18n.t('queryResult')}
						{props.result ? (
							<Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
								{props.result.totalRowCount}
							</Badge>
						) : null}
					</TabsTrigger>
					<TabsTrigger value="sql" className="h-9 gap-1.5 px-2.5 text-xs">
						<SquareTerminal className="size-3.5" aria-hidden="true" />
						SQL / Explain
					</TabsTrigger>
					<TabsTrigger value="history" className="h-9 gap-1.5 px-2.5 text-xs">
						<Clock3 className="size-3.5" aria-hidden="true" />
						{props.i18n.t('history')}
						{props.runs.length ? (
							<Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
								{props.runs.length}
							</Badge>
						) : null}
					</TabsTrigger>
				</TabsList>
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
					{props.running ? (
						<span className="flex items-center gap-1.5">
							<span className="size-1.5 animate-pulse rounded-full bg-primary" />
							{props.i18n.t('executionRunning')}
						</span>
					) : null}
					{props.result?.durationMs !== undefined ? (
						<span className="tabular-nums">
							{props.i18n.t('duration', { duration: props.result.durationMs })}
						</span>
					) : null}
					{props.result?.truncated ? (
						<span className="text-amber-600">{props.i18n.t('resultTruncated')}</span>
					) : null}
				</div>
			</div>
			<TabsContent value="result" className="min-h-0 overflow-auto">
				<QueryResultTable result={props.result} i18n={props.i18n} />
			</TabsContent>
			<TabsContent value="sql" className="min-h-0 overflow-hidden">
				{props.result?.sql ? (
					<MonacoCodeEditor value={props.result.sql} language="sql" ariaLabel="SQL / Explain" readOnly />
				) : (
					<CompactEmptyState title="SQL / Explain" description={props.i18n.t('sqlEmpty')} />
				)}
			</TabsContent>
			<TabsContent value="history" className="min-h-0 overflow-auto">
				<QueryHistory runs={props.runs} i18n={props.i18n} />
			</TabsContent>
		</Tabs>
	)
}

function QueryResultTable(props: { result: QueryResult | null; i18n: QueryLabI18n }) {
	if (!props.result) {
		return <CompactEmptyState title={props.i18n.t('emptyTitle')} description={props.i18n.t('emptyDescription')} />
	}
	return (
		<Table>
			<TableHeader className="sticky top-0 z-10 bg-background">
				<TableRow className="bg-muted/35 hover:bg-muted/35">
					{props.result.columns.map((column) => (
						<TableHead key={column.name} className="h-9 min-w-32 whitespace-nowrap px-3 text-[11px]">
							<span>{column.name}</span>
							{column.type ? (
								<span className="ml-1.5 font-mono text-[9px] font-normal text-muted-foreground">
									{column.type}
								</span>
							) : null}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.result.rows.map((row, rowIndex) => (
					<TableRow key={rowIndex}>
						{props.result?.columns.map((column) => (
							<TableCell
								key={`${rowIndex}:${column.name}`}
								className="h-9 max-w-[360px] truncate px-3 py-1.5 text-xs"
							>
								{formatCell(row[column.name])}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function QueryHistory(props: { runs: QueryRun[]; i18n: QueryLabI18n }) {
	if (!props.runs.length) {
		return <CompactEmptyState title={props.i18n.t('history')} description={props.i18n.t('noHistory')} />
	}
	return (
		<Table>
			<TableHeader className="sticky top-0 z-10 bg-background">
				<TableRow className="bg-muted/35 hover:bg-muted/35">
					<TableHead className="h-9 w-36 px-3 text-[11px]">{props.i18n.t('cube')}</TableHead>
					<TableHead className="h-9 px-3 text-[11px]">{props.i18n.t('statement')}</TableHead>
					<TableHead className="h-9 w-28 px-3 text-[11px]">{props.i18n.t('startedAt')}</TableHead>
					<TableHead className="h-9 w-24 px-3 text-[11px]">{props.i18n.t('status')}</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.runs.map((run) => (
					<TableRow key={run.id}>
						<TableCell className="h-10 px-3 py-1.5 text-xs font-medium">{run.cubeName}</TableCell>
						<TableCell className="h-10 max-w-[560px] px-3 py-1.5">
							<div className="truncate font-mono text-[10px]">{run.statement}</div>
							{run.error ? (
								<div className="mt-0.5 truncate text-[10px] text-destructive">{run.error}</div>
							) : null}
						</TableCell>
						<TableCell className="h-10 px-3 py-1.5 text-[10px] tabular-nums text-muted-foreground">
							{props.i18n.formatTime(run.startedAt)}
						</TableCell>
						<TableCell className="h-10 px-3 py-1.5">
							<div className="flex items-center gap-1.5">
								<RunStatusBadge run={run} i18n={props.i18n} />
								{typeof run.durationMs === 'number' ? (
									<span className="text-[9px] tabular-nums text-muted-foreground">
										{run.durationMs} ms
									</span>
								) : null}
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function RunStatusBadge(props: { run: QueryRun; i18n: QueryLabI18n }) {
	const label =
		props.run.status === 'success'
			? props.i18n.t('executionSuccess')
			: props.run.status === 'error'
				? props.i18n.t('executionError')
				: props.i18n.t('executionRunning')
	return (
		<Badge
			variant={
				props.run.status === 'error' ? 'destructive' : props.run.status === 'success' ? 'default' : 'secondary'
			}
			className="h-5 px-1.5 text-[9px]"
		>
			{label}
		</Badge>
	)
}

function CompactEmptyState(props: { title: string; description: string }) {
	return (
		<div className="grid h-full min-h-36 place-items-center px-6 text-center">
			<div>
				<div className="text-xs font-medium">{props.title}</div>
				<p className="mt-1 max-w-md text-[11px] leading-5 text-muted-foreground">{props.description}</p>
			</div>
		</div>
	)
}

function defaultStatement(cubeName: string) {
	return `SELECT
  [Measures].Members ON COLUMNS
FROM ${mdxIdentifier(cubeName)}`
}

type QueryTemplate = {
	id: string
	label: string
	statement: string
}

function buildQueryTemplates(schema: JsonObject, cubeName: string, i18n: QueryLabI18n): QueryTemplate[] {
	if (!cubeName) {
		return []
	}
	const cube = objectCollection(schema, 'cubes').find(
		(item) => (readString(item, 'name') ?? readString(item, 'caption')) === cubeName
	)
	if (!cube) {
		return []
	}
	const templates: QueryTemplate[] = [
		{
			id: 'all-measures',
			label: i18n.t('allMeasures'),
			statement: defaultStatement(cubeName)
		}
	]
	const sharedDimensions = objectCollection(schema, 'dimensions')
	const dimensionCandidates = [
		...objectCollection(cube, 'dimensionUsages').map((usage) => {
			const sourceName = readString(usage, 'source') ?? readString(usage, 'name') ?? ''
			const dimension = sharedDimensions.find(
				(item) =>
					(readString(item, 'name') ?? readString(item, 'caption') ?? '').toLowerCase() ===
					sourceName.toLowerCase()
			)
			return {
				dimension,
				queryName:
					readString(usage, 'name') ??
					readString(usage, 'caption') ??
					readString(dimension, 'name') ??
					sourceName
			}
		}),
		...objectCollection(cube, 'dimensions').map((dimension) => ({
			dimension,
			queryName: readString(dimension, 'name') ?? readString(dimension, 'caption') ?? ''
		}))
	]
	const seen = new Set<string>()
	for (const candidate of dimensionCandidates) {
		const dimension = candidate.dimension
		if (!dimension || !candidate.queryName) {
			continue
		}
		const hierarchies = objectCollection(dimension, 'hierarchies')
		const defaultHierarchy = readString(dimension, 'defaultHierarchy')
		const hierarchy =
			hierarchies.find(
				(item) => (readString(item, 'name') ?? readString(item, 'caption') ?? '') === defaultHierarchy
			) ?? hierarchies[0]
		const levels = hierarchy ? objectCollection(hierarchy, 'levels') : []
		const level = levels[levels.length - 1]
		const hierarchyName = readString(hierarchy, 'name') ?? readString(hierarchy, 'caption') ?? candidate.queryName
		const levelName = readString(level, 'name') ?? readString(level, 'caption')
		if (!hierarchyName || !levelName) {
			continue
		}
		const key = `${candidate.queryName}:${hierarchyName}:${levelName}`.toLowerCase()
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		templates.push({
			id: `group:${key}`,
			label: i18n.t('groupBy', { dimension: candidate.queryName }),
			statement: `SELECT
  [Measures].Members ON COLUMNS,
  ${[candidate.queryName, hierarchyName, levelName].map(mdxIdentifier).join('.')}.Members ON ROWS
FROM ${mdxIdentifier(cubeName)}`
		})
	}
	return templates
}

function mdxIdentifier(value: string) {
	return `[${value.replaceAll(']', ']]')}]`
}

function formatCell(value: unknown) {
	if (value === null || value === undefined) {
		return '—'
	}
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
