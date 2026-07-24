import * as React from 'react'
import {
	Badge,
	Button,
	Card,
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
	TabsTrigger,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { localized, objectCollection } from './schema-utils'
import { QueryResult, QueryRun } from './studio-types'

export function QueryLab(props: {
	schema: JsonObject
	result: QueryResult | null
	runs: QueryRun[]
	running: boolean
	locale?: string
	onRun(cubeName: string, statement: string): void
}) {
	const cubes = objectCollection(props.schema, 'cubes')
	const cubeNames = cubes.map((cube) => readString(cube, 'name') ?? readString(cube, 'caption') ?? '').filter(Boolean)
	const [cubeName, setCubeName] = React.useState(cubeNames[0] ?? '')
	const [statement, setStatement] = React.useState(() => defaultStatement(cubeNames[0] ?? 'Cube'))

	React.useEffect(() => {
		if (!cubeNames.length) {
			setCubeName('')
			return
		}
		if (!cubeNames.includes(cubeName)) {
			setCubeName(cubeNames[0])
			setStatement(defaultStatement(cubeNames[0]))
		}
	}, [cubeName, cubeNames.join('|')])

	return (
		<div className="flex min-h-full flex-col bg-background">
			<div className="border-b bg-card/40 px-5 py-5">
				<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
					{localized(props.locale, 'Consumption validation', '消费验证')}
				</div>
				<div className="mt-1 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-xl font-semibold tracking-tight">Query Lab</h1>
						<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
							{localized(
								props.locale,
								'Write and execute MDX against the current semantic model, then inspect real rows, SQL, and audit output.',
								'编辑并执行 MDX，针对当前语义模型查看真实结果、生成 SQL 与审计信息。'
							)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Select value={cubeName} onValueChange={setCubeName}>
							<SelectTrigger className="w-44" aria-label="Cube">
								<SelectValue placeholder={localized(props.locale, 'Choose Cube', '选择 Cube')} />
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
							disabled={!cubeName || !statement.trim() || props.running}
							onClick={() => props.onRun(cubeName, statement)}
						>
							{props.running
								? localized(props.locale, 'Running…', '运行中…')
								: localized(props.locale, 'Run query', '运行查询')}
						</Button>
					</div>
				</div>
			</div>

			<div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,34vh)_minmax(0,1fr)]">
				<div className="border-b p-4">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-xs font-medium">MDX</div>
						<div className="text-[11px] text-muted-foreground">
							{localized(props.locale, 'Published runtime contract', '已发布运行时契约')}
						</div>
					</div>
					<Textarea
						className="h-[calc(100%-24px)] min-h-36 resize-none bg-zinc-950 font-mono text-xs leading-6 text-zinc-100 dark:bg-zinc-950"
						value={statement}
						spellCheck={false}
						onChange={(event) => setStatement(event.currentTarget.value)}
					/>
				</div>

				<Tabs defaultValue="result" className="min-h-0 gap-0">
					<div className="flex h-11 items-center justify-between border-b px-4">
						<TabsList variant="line" className="h-10">
							<TabsTrigger value="result" className="text-xs">
								{localized(props.locale, 'Result', '查询结果')}
								{props.result ? (
									<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
										{props.result.totalRowCount}
									</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="sql" className="text-xs">
								SQL / Explain
							</TabsTrigger>
							<TabsTrigger value="history" className="text-xs">
								{localized(props.locale, 'Run history', '执行记录')}
							</TabsTrigger>
						</TabsList>
						{props.result?.truncated ? (
							<div className="text-[11px] text-amber-600">
								{localized(props.locale, 'Result truncated', '结果已截断')}
							</div>
						) : null}
					</div>
					<TabsContent value="result" className="min-h-0 overflow-auto">
						<QueryResultTable result={props.result} locale={props.locale} />
					</TabsContent>
					<TabsContent value="sql" className="min-h-0 overflow-auto p-4">
						<pre className="min-h-full whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-xs leading-6">
							{props.result?.sql ??
								localized(
									props.locale,
									'Run a query to inspect the generated SQL and execution audit.',
									'运行查询后可查看生成的 SQL 与执行审计。'
								)}
						</pre>
					</TabsContent>
					<TabsContent value="history" className="min-h-0 overflow-auto p-4">
						<div className="space-y-2">
							{props.runs.map((run) => (
								<Card key={run.id} className="flex items-center justify-between gap-3 p-3 shadow-none">
									<div className="min-w-0">
										<div className="truncate text-xs font-medium">{run.cubeName}</div>
										<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
											{run.statement}
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										{typeof run.durationMs === 'number' ? (
											<span className="text-[10px] text-muted-foreground">
												{run.durationMs} ms
											</span>
										) : null}
										<Badge
											variant={
												run.status === 'error'
													? 'destructive'
													: run.status === 'success'
														? 'default'
														: 'secondary'
											}
										>
											{run.status}
										</Badge>
									</div>
								</Card>
							))}
							{!props.runs.length ? (
								<div className="grid min-h-40 place-items-center text-xs text-muted-foreground">
									{localized(
										props.locale,
										'No queries have run in this session.',
										'当前会话尚未运行查询。'
									)}
								</div>
							) : null}
						</div>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	)
}

function QueryResultTable(props: { result: QueryResult | null; locale?: string }) {
	if (!props.result) {
		return (
			<div className="grid min-h-48 place-items-center px-6 text-center">
				<div>
					<div className="text-sm font-medium">
						{localized(props.locale, 'Ready to query real data', '可以开始查询真实数据')}
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{localized(
							props.locale,
							'Choose a Cube, edit the MDX statement, and run it against the semantic service.',
							'选择 Cube、编辑 MDX，然后通过语义服务执行。'
						)}
					</p>
				</div>
			</div>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow className="bg-muted/35">
					{props.result.columns.map((column) => (
						<TableHead key={column.name} className="h-10 min-w-36 whitespace-nowrap text-xs">
							<div>{column.name}</div>
							{column.type ? (
								<div className="font-mono text-[9px] font-normal text-muted-foreground">
									{column.type}
								</div>
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
								className="h-11 max-w-[360px] truncate text-xs"
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

function defaultStatement(cubeName: string) {
	return `SELECT
  [Measures].Members ON COLUMNS
FROM [${cubeName}]`
}

function formatCell(value: unknown) {
	if (value === null || value === undefined) {
		return '—'
	}
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
