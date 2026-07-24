import * as React from 'react'
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	ScrollArea,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@xpert-ai/shadcn-ui'
import { EmptyCollection, SectionHeading } from './editor-shared'
import { localized } from './schema-utils'

export type SourceColumn = {
	name: string
	label?: string
	type?: string
	dataType?: string
	nullable?: boolean
	comment?: string
}

export function SourceBrowser(props: {
	tables: string[]
	selectedTable: string
	columns: SourceColumn[]
	loading: boolean
	error?: string
	locale?: string
	onLoadTables(): void
	onSelectTable(table: string): void
	onCreateDimension(table: string, columns: SourceColumn[]): void
	onCreateCube(table: string, columns: SourceColumn[]): void
}) {
	const [search, setSearch] = React.useState('')
	const filteredTables = props.tables.filter((table) => table.toLowerCase().includes(search.trim().toLowerCase()))

	return (
		<div className="space-y-5">
			<SectionHeading
				title={localized(props.locale, 'Source explorer', '数据源浏览器')}
				description={localized(
					props.locale,
					'Inspect physical tables and columns, then bootstrap governed dimensions or cubes from metadata.',
					'检查物理表与字段元数据，并据此快速生成受治理的维度或 Cube。'
				)}
				action={
					<Button variant="outline" onClick={props.onLoadTables} disabled={props.loading}>
						{localized(
							props.locale,
							props.tables.length ? 'Refresh metadata' : 'Load tables',
							props.tables.length ? '刷新元数据' : '加载数据表'
						)}
					</Button>
				}
			/>

			{props.error ? (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{props.error}
				</div>
			) : null}

			{props.loading && !props.tables.length ? (
				<div className="grid gap-3 lg:grid-cols-[280px_1fr]">
					<Skeleton className="h-[420px]" />
					<Skeleton className="h-[420px]" />
				</div>
			) : props.tables.length ? (
				<div className="grid min-h-[520px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
					<Card className="min-h-0">
						<CardHeader className="space-y-3 py-3">
							<CardTitle className="flex items-center justify-between text-sm">
								<span>{localized(props.locale, 'Tables', '数据表')}</span>
								<Badge variant="secondary">{props.tables.length}</Badge>
							</CardTitle>
							<Input
								value={search}
								placeholder={localized(props.locale, 'Search tables…', '搜索数据表…')}
								onChange={(event) => setSearch(event.currentTarget.value)}
							/>
						</CardHeader>
						<CardContent className="p-0">
							<ScrollArea className="h-[450px]">
								<div className="space-y-0.5 p-2">
									{filteredTables.map((table) => (
										<Button
											key={table}
											variant={props.selectedTable === table ? 'secondary' : 'ghost'}
											className="w-full justify-start truncate font-mono text-xs"
											onClick={() => props.onSelectTable(table)}
										>
											{table}
										</Button>
									))}
								</div>
							</ScrollArea>
						</CardContent>
					</Card>

					<Card className="min-w-0">
						<CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 py-3">
							<div>
								<CardTitle className="font-mono text-sm">
									{props.selectedTable || localized(props.locale, 'Choose a table', '请选择数据表')}
								</CardTitle>
								<div className="mt-1 text-xs text-muted-foreground">
									{localized(
										props.locale,
										`${props.columns.length} columns`,
										`${props.columns.length} 个字段`
									)}
								</div>
							</div>
							{props.selectedTable ? (
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => props.onCreateDimension(props.selectedTable, props.columns)}
									>
										{localized(props.locale, 'Create dimension', '生成维度')}
									</Button>
									<Button
										size="sm"
										onClick={() => props.onCreateCube(props.selectedTable, props.columns)}
									>
										{localized(props.locale, 'Create cube', '生成 Cube')}
									</Button>
								</div>
							) : null}
						</CardHeader>
						<CardContent className="min-w-0 p-0">
							{props.loading && props.selectedTable ? (
								<div className="space-y-2 p-4">
									{Array.from({ length: 7 }, (_, index) => (
										<Skeleton key={index} className="h-8 w-full" />
									))}
								</div>
							) : props.columns.length ? (
								<ScrollArea className="h-[450px]">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-card">
											<TableRow>
												<TableHead>{localized(props.locale, 'Column', '字段')}</TableHead>
												<TableHead>{localized(props.locale, 'Type', '类型')}</TableHead>
												<TableHead>{localized(props.locale, 'Nullable', '可空')}</TableHead>
												<TableHead>{localized(props.locale, 'Description', '描述')}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{props.columns.map((column) => (
												<TableRow key={column.name}>
													<TableCell>
														<div className="font-mono text-xs">{column.name}</div>
														{column.label && column.label !== column.name ? (
															<div className="text-xs text-muted-foreground">
																{column.label}
															</div>
														) : null}
													</TableCell>
													<TableCell>
														<Badge variant="outline">
															{column.dataType ?? column.type ?? 'unknown'}
														</Badge>
													</TableCell>
													<TableCell>{column.nullable ? 'YES' : 'NO'}</TableCell>
													<TableCell className="max-w-64 truncate">
														{column.comment ?? '—'}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</ScrollArea>
							) : (
								<div className="grid h-[450px] place-items-center text-sm text-muted-foreground">
									{localized(
										props.locale,
										'Select a table to inspect its columns.',
										'选择数据表以查看字段。'
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			) : (
				<EmptyCollection
					title={localized(props.locale, 'Metadata is not loaded', '尚未加载元数据')}
					description={localized(
						props.locale,
						'Load the workspace data source before mapping semantic artifacts.',
						'映射语义对象前请先加载工作空间的数据源。'
					)}
					action={
						<Button onClick={props.onLoadTables}>
							{localized(props.locale, 'Load tables', '加载数据表')}
						</Button>
					}
				/>
			)}
		</div>
	)
}
