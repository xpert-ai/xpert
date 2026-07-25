import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Badge,
	Button,
	Card,
	CardContent,
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Input,
	installShadcnThemeVars,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@xpert-ai/shadcn-ui'
import {
	applyHostTheme,
	buildInitialQuery,
	createRemoteBridge,
	JsonObject,
	readData,
	readLocalizedText,
	readObject,
	readResult,
	readString,
	RemoteContext,
	RemoteHostEvent
} from '../../../../remote-components/shared/runtime'
import { MetricEditorDialog } from './metric-editor'
import {
	emptyMetricForm,
	MetricForm,
	MetricPage,
	MetricRow,
	metricFormFromRow,
	metricFormToInput,
	Option,
	parseMetricPage,
	parseOptions,
	tr
} from './types'

const bridge = createRemoteBridge('datax-metric-management')

function MetricManagementApp() {
	const [context, setContext] = React.useState<RemoteContext | null>(null)
	const [query, setQuery] = React.useState<JsonObject>({ page: 1, pageSize: 20, parameters: {} })
	const [projects, setProjects] = React.useState<Option[]>([])
	const [models, setModels] = React.useState<Option[]>([])
	const [cubes, setCubes] = React.useState<Option[]>([])
	const [measures, setMeasures] = React.useState<Option[]>([])
	const [businessAreas, setBusinessAreas] = React.useState<Option[]>([])
	const [statuses, setStatuses] = React.useState<Option[]>([])
	const [types, setTypes] = React.useState<Option[]>([])
	const [certifications, setCertifications] = React.useState<Option[]>([])
	const [page, setPage] = React.useState<MetricPage>({ items: [], total: 0 })
	const [search, setSearch] = React.useState('')
	const [loading, setLoading] = React.useState(false)
	const [busy, setBusy] = React.useState('')
	const [notice, setNotice] = React.useState<{ error: boolean; text: string } | null>(null)
	const [selectedIds, setSelectedIds] = React.useState<string[]>([])
	const [editorOpen, setEditorOpen] = React.useState(false)
	const [editorMode, setEditorMode] = React.useState<'create' | 'edit'>('create')
	const [editingRow, setEditingRow] = React.useState<MetricRow | null>(null)
	const [form, setForm] = React.useState<MetricForm>(emptyMetricForm)
	const [deleteTarget, setDeleteTarget] = React.useState<MetricRow | null>(null)
	const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
	const [detailRow, setDetailRow] = React.useState<MetricRow | null>(null)
	const importInputRef = React.useRef<HTMLInputElement>(null)

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
	}, [page, notice, editorOpen, detailRow])

	const editorProjectId = readString(readObject(query, 'parameters'), 'projectId') ?? ''

	React.useEffect(() => {
		let active = true
		if (!editorOpen || !editorProjectId || !form.modelId) {
			setCubes([])
			return () => {
				active = false
			}
		}
		void loadOptions('cube', {
			projectId: editorProjectId,
			modelId: form.modelId
		}).then((options) => {
			if (!active) {
				return
			}
			setCubes(options)
			if (!form.cube && options[0]) {
				setForm((current) =>
					current.modelId === form.modelId ? { ...current, cube: options[0].value } : current
				)
			}
		})
		return () => {
			active = false
		}
	}, [editorOpen, editorProjectId, form.modelId])

	React.useEffect(() => {
		let active = true
		if (!editorOpen || !editorProjectId || !form.modelId || !form.cube) {
			setMeasures([])
			return () => {
				active = false
			}
		}
		void loadOptions('measure', {
			projectId: editorProjectId,
			modelId: form.modelId,
			cube: form.cube
		}).then((options) => {
			if (!active) {
				return
			}
			setMeasures(options)
			if (!form.measure && options[0]) {
				setForm((current) =>
					current.modelId === form.modelId && current.cube === form.cube
						? { ...current, measure: options[0].value }
						: current
				)
			}
		})
		return () => {
			active = false
		}
	}, [editorOpen, editorProjectId, form.modelId, form.cube])

	async function initialize(initialQuery: JsonObject) {
		setLoading(true)
		try {
			const baseParameters = readObject(initialQuery, 'parameters') ?? {}
			const [projectOptions, statusOptions, typeOptions, certificationOptions] = await Promise.all([
				loadOptions('projectId', baseParameters),
				loadOptions('status', baseParameters),
				loadOptions('type', baseParameters),
				loadOptions('certificationId', baseParameters)
			])
			setProjects(projectOptions)
			setStatuses(statusOptions)
			setTypes(typeOptions)
			setCertifications(certificationOptions)
			const projectId = readString(baseParameters, 'projectId') ?? projectOptions[0]?.value
			if (!projectId) {
				setPage({ items: [], total: 0 })
				return
			}
			const readyQuery = withQueryParameter(initialQuery, 'projectId', projectId)
			setQuery(readyQuery)
			await loadProjectOptions(readyQuery)
			await loadRows(readyQuery)
		} catch (error) {
			showError(error)
		} finally {
			setLoading(false)
		}
	}

	async function loadOptions(parameterKey: string, parameters: JsonObject, optionSearch?: string) {
		const response = await bridge.requestParameterOptions(parameterKey, {
			parameters,
			search: optionSearch
		})
		return parseOptions(readResult(response))
	}

	async function loadProjectOptions(nextQuery: JsonObject) {
		const parameters = readObject(nextQuery, 'parameters') ?? {}
		const [modelOptions, areaOptions] = await Promise.all([
			loadOptions('modelId', parameters),
			loadOptions('businessAreaId', parameters)
		])
		setModels(modelOptions)
		setBusinessAreas(areaOptions)
	}

	async function loadRows(nextQuery = query) {
		const projectId = readString(readObject(nextQuery, 'parameters'), 'projectId')
		if (!projectId) {
			setPage({ items: [], total: 0 })
			return
		}
		setLoading(true)
		try {
			const response = await bridge.requestData(nextQuery)
			setPage(parseMetricPage(readData(response)))
			setSelectedIds([])
		} catch (error) {
			showError(error)
		} finally {
			setLoading(false)
		}
	}

	async function changeProject(projectId: string) {
		let nextQuery = withQueryParameter(query, 'projectId', projectId)
		nextQuery = withQueryParameter(nextQuery, 'modelId', '')
		nextQuery = withQueryParameter(nextQuery, 'businessAreaId', '')
		nextQuery = { ...nextQuery, page: 1 }
		setQuery(nextQuery)
		setModels([])
		setBusinessAreas([])
		await loadProjectOptions(nextQuery)
		await loadRows(nextQuery)
	}

	async function changeFilter(key: string, value: string) {
		const nextQuery = {
			...withQueryParameter(query, key, value === '__all__' ? '' : value),
			page: 1
		}
		setQuery(nextQuery)
		await loadRows(nextQuery)
	}

	async function applySearch() {
		const nextQuery = {
			...query,
			search: search.trim() || undefined,
			page: 1
		}
		setQuery(nextQuery)
		await loadRows(nextQuery)
	}

	async function changePage(nextPage: number) {
		const nextQuery = { ...query, page: nextPage }
		setQuery(nextQuery)
		await loadRows(nextQuery)
	}

	function openCreate() {
		const parameters = readObject(query, 'parameters') ?? {}
		setEditorMode('create')
		setEditingRow(null)
		setCubes([])
		setMeasures([])
		setForm({
			...emptyMetricForm(),
			modelId: readString(parameters, 'modelId') ?? '',
			businessAreaId: readString(parameters, 'businessAreaId') ?? ''
		})
		setEditorOpen(true)
	}

	function openEdit(row: MetricRow) {
		setEditorMode('edit')
		setEditingRow(row)
		setCubes([])
		setMeasures([])
		setForm(metricFormFromRow(row))
		setEditorOpen(true)
	}

	function updateMetricForm(nextForm: MetricForm) {
		setForm((current) => {
			if (nextForm.modelId !== current.modelId) {
				return { ...nextForm, cube: '', measure: '' }
			}
			if (nextForm.cube !== current.cube) {
				return { ...nextForm, measure: '' }
			}
			return nextForm
		})
	}

	async function saveMetric() {
		const projectId = readString(readObject(query, 'parameters'), 'projectId')
		if (!projectId) {
			setNotice({ error: true, text: tr(context?.locale, 'Choose a project first.', '请先选择项目。') })
			return
		}
		setBusy('editor')
		try {
			const result = await executeAction(editorMode === 'create' ? 'create' : 'edit', {
				targetId: editingRow?.id,
				input: metricFormToInput(form),
				parameters: readObject(query, 'parameters')
			})
			setEditorOpen(false)
			showActionMessage(result)
			await loadRows(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function runRowAction(actionKey: string, row: MetricRow) {
		setBusy(`${actionKey}:${row.id}`)
		try {
			const result = await executeAction(actionKey, {
				targetId: row.id,
				parameters: readObject(query, 'parameters')
			})
			showActionMessage(result)
			await loadRows(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function deleteMetric() {
		if (!deleteTarget) {
			return
		}
		const target = deleteTarget
		setDeleteTarget(null)
		await runRowAction('delete', target)
	}

	async function bulkDelete() {
		setBulkDeleteOpen(false)
		setBusy('bulk-delete')
		try {
			const result = await executeAction('bulk_delete', {
				input: { ids: selectedIds },
				parameters: readObject(query, 'parameters')
			})
			showActionMessage(result)
			await loadRows(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function exportMetrics() {
		setBusy('export')
		try {
			const result = await executeAction('export', {
				input: {
					ids: selectedIds,
					page: query['page'],
					pageSize: query['pageSize'],
					search: query['search']
				},
				parameters: readObject(query, 'parameters')
			})
			showActionMessage(result)
			const data = readObject(result, 'data')
			const content = readString(data, 'content')
			const fileName = readString(data, 'fileName') ?? 'metrics.yaml'
			const mimeType = readString(data, 'mimeType') ?? 'application/x-yaml'
			if (content) {
				downloadText(fileName, content, mimeType)
			}
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function importMetrics(file: File) {
		setBusy('import')
		try {
			const response = await bridge.executeFileAction('import', file, {
				parameters: readObject(query, 'parameters')
			})
			const result = readResult(response)
			if (result['success'] !== true) {
				throw new Error(
					readLocalizedText(result['message'], context?.locale ?? 'en-US', 'Metric import failed.')
				)
			}
			showActionMessage(result)
			await loadRows(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
			if (importInputRef.current) {
				importInputRef.current.value = ''
			}
		}
	}

	async function embedProject() {
		setBusy('embed-project')
		try {
			const result = await executeAction('start_embedding_project', {
				parameters: readObject(query, 'parameters')
			})
			showActionMessage(result)
			await loadRows(query)
		} catch (error) {
			showError(error)
		} finally {
			setBusy('')
		}
	}

	async function executeAction(
		actionKey: string,
		options: {
			targetId?: string
			input?: JsonObject
			parameters?: JsonObject
		}
	) {
		const response = await bridge.executeAction(actionKey, options)
		const result = readResult(response)
		if (result['success'] !== true) {
			throw new Error(
				readLocalizedText(
					result['message'],
					context?.locale ?? 'en-US',
					tr(context?.locale, 'Action failed.', '操作失败。')
				)
			)
		}
		return result
	}

	function showActionMessage(result: JsonObject) {
		setNotice({
			error: false,
			text: readLocalizedText(
				result['message'],
				context?.locale ?? 'en-US',
				tr(context?.locale, 'Operation completed.', '操作已完成。')
			)
		})
	}

	async function handleHostEvent(event: RemoteHostEvent) {
		if (event.type === 'assistant.tool.completed') {
			await loadRows(query)
		}
	}

	function showError(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		setNotice({ error: true, text: message })
		bridge.logger.error('metric.operation.failed', { message })
	}

	const parameters = readObject(query, 'parameters') ?? {}
	const projectId = readString(parameters, 'projectId') ?? ''
	const currentPage = typeof query['page'] === 'number' ? query['page'] : 1
	const pageSize = typeof query['pageSize'] === 'number' ? query['pageSize'] : 20
	const pageCount = Math.max(1, Math.ceil(page.total / pageSize))
	const allVisibleSelected = page.items.length > 0 && page.items.every((row) => selectedIds.includes(row.id))

	return (
		<TooltipProvider>
			<div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
				<header className="flex min-h-14 flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
					<div className="mr-2 min-w-40">
						<div className="text-sm font-semibold">
							{tr(context?.locale, 'Metric Management', '指标管理')}
						</div>
						<div className="text-xs text-muted-foreground">
							{tr(context?.locale, 'Governed catalog & lifecycle', '受治理的指标目录与生命周期')}
						</div>
					</div>
					<Select value={projectId} onValueChange={(value) => void changeProject(value)}>
						<SelectTrigger className="w-[240px]">
							<SelectValue placeholder={tr(context?.locale, 'Choose project', '选择项目')} />
						</SelectTrigger>
						<SelectContent>
							{projects.map((project) => (
								<SelectItem key={project.value} value={project.value}>
									{project.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button onClick={openCreate} disabled={!projectId}>
						{tr(context?.locale, 'New metric', '新建指标')}
					</Button>
					<Button variant="outline" disabled={loading} onClick={() => void loadRows()}>
						{tr(context?.locale, 'Refresh', '刷新')}
					</Button>
					<div className="flex-1" />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">{tr(context?.locale, 'Operations', '批量操作')}</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem disabled={!selectedIds.length} onSelect={() => void exportMetrics()}>
								{tr(context?.locale, 'Export selected', '导出选中')}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => importInputRef.current?.click()}>
								{tr(context?.locale, 'Import YAML', '导入 YAML')}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={() => void embedProject()}>
								{tr(context?.locale, 'Embed project', '项目全量向量化')}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!selectedIds.length}
								className="text-destructive"
								onSelect={() => setBulkDeleteOpen(true)}
							>
								{tr(context?.locale, 'Delete selected', '删除选中')}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<input
						ref={importInputRef}
						className="hidden"
						type="file"
						accept=".yaml,.yml,text/yaml,application/yaml"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0]
							if (file) {
								void importMetrics(file)
							}
						}}
					/>
				</header>

				<div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
					<div className="flex min-w-64 flex-1 gap-2">
						<Input
							value={search}
							placeholder={tr(
								context?.locale,
								'Search code, name, or definition…',
								'搜索编码、名称或口径…'
							)}
							onChange={(event) => setSearch(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									void applySearch()
								}
							}}
						/>
						<Button variant="outline" onClick={() => void applySearch()}>
							{tr(context?.locale, 'Search', '搜索')}
						</Button>
					</div>
					<FilterSelect
						value={readString(parameters, 'modelId') ?? '__all__'}
						placeholder={tr(context?.locale, 'All models', '全部模型')}
						options={models}
						onChange={(value) => void changeFilter('modelId', value)}
					/>
					<FilterSelect
						value={readString(parameters, 'status') ?? '__all__'}
						placeholder={tr(context?.locale, 'All statuses', '全部状态')}
						options={statuses}
						onChange={(value) => void changeFilter('status', value)}
					/>
					<FilterSelect
						value={readString(parameters, 'type') ?? '__all__'}
						placeholder={tr(context?.locale, 'All types', '全部类型')}
						options={types}
						onChange={(value) => void changeFilter('type', value)}
					/>
				</div>

				{notice ? (
					<div
						className={
							notice.error
								? 'border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive'
								: 'border-b bg-primary/5 px-4 py-2 text-sm'
						}
					>
						{notice.text}
					</div>
				) : null}

				<div className="min-h-0 flex-1 overflow-hidden">
					{loading && !page.items.length ? (
						<div className="space-y-2 p-4">
							{Array.from({ length: 9 }, (_, index) => (
								<Skeleton key={index} className="h-10 w-full" />
							))}
						</div>
					) : !projectId ? (
						<div className="grid h-full place-items-center text-sm text-muted-foreground">
							{tr(
								context?.locale,
								'Choose a project to load its metric catalog.',
								'选择项目以加载指标目录。'
							)}
						</div>
					) : !page.items.length ? (
						<div className="grid h-full place-items-center">
							<Card className="max-w-md">
								<CardContent className="space-y-3 pt-6 text-center">
									<div className="font-medium">
										{tr(context?.locale, 'No metrics found', '未找到指标')}
									</div>
									<div className="text-sm text-muted-foreground">
										{tr(
											context?.locale,
											'Create the first governed metric in this scope.',
											'在当前范围内创建第一个受治理指标。'
										)}
									</div>
									<Button onClick={openCreate}>
										{tr(context?.locale, 'New metric', '新建指标')}
									</Button>
								</CardContent>
							</Card>
						</div>
					) : (
						<ScrollArea className="h-full">
							<Table>
								<TableHeader className="sticky top-0 z-20 bg-card">
									<TableRow>
										<TableHead className="w-10">
											<Checkbox
												checked={allVisibleSelected}
												onCheckedChange={(checked) =>
													setSelectedIds(
														checked === true
															? Array.from(
																	new Set([
																		...selectedIds,
																		...page.items.map((row) => row.id)
																	])
																)
															: selectedIds.filter(
																	(id) => !page.items.some((row) => row.id === id)
																)
													)
												}
											/>
										</TableHead>
										<TableHead>{tr(context?.locale, 'Metric', '指标')}</TableHead>
										<TableHead>{tr(context?.locale, 'Type', '类型')}</TableHead>
										<TableHead>{tr(context?.locale, 'Model / Cube', '模型 / Cube')}</TableHead>
										<TableHead>{tr(context?.locale, 'Business area', '业务域')}</TableHead>
										<TableHead>{tr(context?.locale, 'Status', '状态')}</TableHead>
										<TableHead>{tr(context?.locale, 'Embedding', '向量状态')}</TableHead>
										<TableHead>{tr(context?.locale, 'Updated', '更新时间')}</TableHead>
										<TableHead className="w-16" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{page.items.map((row) => (
										<TableRow
											key={row.id}
											className="cursor-pointer"
											onDoubleClick={() => setDetailRow(row)}
										>
											<TableCell>
												<Checkbox
													checked={selectedIds.includes(row.id)}
													onCheckedChange={(checked) =>
														setSelectedIds(
															checked === true
																? Array.from(new Set([...selectedIds, row.id]))
																: selectedIds.filter((id) => id !== row.id)
														)
													}
												/>
											</TableCell>
											<TableCell className="min-w-64">
												<button
													className="block text-left"
													type="button"
													onClick={() => setDetailRow(row)}
												>
													<div className="font-medium">{row.name || row.code}</div>
													<div className="font-mono text-xs text-muted-foreground">
														{row.code}
													</div>
												</button>
											</TableCell>
											<TableCell>
												<Badge variant="outline">{row.type}</Badge>
											</TableCell>
											<TableCell>
												<div className="max-w-52 truncate text-sm">{row.modelName ?? '—'}</div>
												<div className="max-w-52 truncate text-xs text-muted-foreground">
													{row.entity ?? '—'}
												</div>
											</TableCell>
											<TableCell>{row.businessAreaName ?? '—'}</TableCell>
											<TableCell>
												<StatusBadge value={row.status} />
											</TableCell>
											<TableCell>
												<Badge variant="secondary">{row.embeddingStatus ?? '—'}</Badge>
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
												{formatDate(row.updatedAt, context?.locale)}
											</TableCell>
											<TableCell>
												<RowActions
													row={row}
													busy={busy}
													locale={context?.locale}
													onEdit={() => openEdit(row)}
													onDuplicate={() => void runRowAction('duplicate', row)}
													onPublish={() => void runRowAction('publish', row)}
													onEmbed={() => void runRowAction('embedding', row)}
													onDelete={() => setDeleteTarget(row)}
												/>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</ScrollArea>
					)}
				</div>

				<footer className="flex min-h-12 items-center justify-between gap-3 border-t bg-card px-4 text-sm">
					<div className="text-muted-foreground">
						{tr(
							context?.locale,
							`${page.total} metric(s) · ${selectedIds.length} selected`,
							`共 ${page.total} 个指标 · 已选择 ${selectedIds.length} 个`
						)}
					</div>
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">
							{currentPage} / {pageCount}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage <= 1 || loading}
							onClick={() => void changePage(currentPage - 1)}
						>
							{tr(context?.locale, 'Previous', '上一页')}
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= pageCount || loading}
							onClick={() => void changePage(currentPage + 1)}
						>
							{tr(context?.locale, 'Next', '下一页')}
						</Button>
					</div>
				</footer>

				<MetricEditorDialog
					open={editorOpen}
					mode={editorMode}
					form={form}
					models={models}
					cubes={cubes}
					measures={measures}
					businessAreas={businessAreas}
					certifications={certifications}
					busy={busy === 'editor'}
					locale={context?.locale}
					onOpenChange={setEditorOpen}
					onChange={updateMetricForm}
					onSubmit={() => void saveMetric()}
				/>

				<MetricDetail
					row={detailRow}
					locale={context?.locale}
					onOpenChange={(open) => !open && setDetailRow(null)}
				/>

				<AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{tr(context?.locale, 'Delete metric?', '删除指标？')}</AlertDialogTitle>
							<AlertDialogDescription>
								{tr(
									context?.locale,
									`This permanently deletes '${deleteTarget?.name ?? deleteTarget?.code ?? ''}'.`,
									`这会永久删除“${deleteTarget?.name ?? deleteTarget?.code ?? ''}”。`
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{tr(context?.locale, 'Cancel', '取消')}</AlertDialogCancel>
							<AlertDialogAction onClick={() => void deleteMetric()}>
								{tr(context?.locale, 'Delete', '删除')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{tr(context?.locale, 'Delete selected metrics?', '删除选中指标？')}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{tr(
									context?.locale,
									`This permanently deletes ${selectedIds.length} metric(s).`,
									`这会永久删除 ${selectedIds.length} 个指标。`
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{tr(context?.locale, 'Cancel', '取消')}</AlertDialogCancel>
							<AlertDialogAction onClick={() => void bulkDelete()}>
								{tr(context?.locale, 'Delete selected', '删除选中')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</TooltipProvider>
	)
}

function FilterSelect(props: { value: string; placeholder: string; options: Option[]; onChange(value: string): void }) {
	return (
		<Select value={props.value} onValueChange={props.onChange}>
			<SelectTrigger className="w-[180px]">
				<SelectValue placeholder={props.placeholder} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__all__">{props.placeholder}</SelectItem>
				{props.options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

function RowActions(props: {
	row: MetricRow
	busy: string
	locale?: string
	onEdit(): void
	onDuplicate(): void
	onPublish(): void
	onEmbed(): void
	onDelete(): void
}) {
	const disabled = props.busy.endsWith(`:${props.row.id}`)
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" disabled={disabled}>
							•••
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>{tr(props.locale, 'Metric actions', '指标操作')}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={props.onEdit}>{tr(props.locale, 'Edit', '编辑')}</DropdownMenuItem>
				<DropdownMenuItem onSelect={props.onDuplicate}>
					{tr(props.locale, 'Duplicate', '复制')}
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={props.onPublish}>{tr(props.locale, 'Publish', '发布')}</DropdownMenuItem>
				<DropdownMenuItem onSelect={props.onEmbed}>{tr(props.locale, 'Embed', '向量化')}</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="text-destructive" onSelect={props.onDelete}>
					{tr(props.locale, 'Delete', '删除')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function MetricDetail(props: { row: MetricRow | null; locale?: string; onOpenChange(open: boolean): void }) {
	const row = props.row
	return (
		<Sheet open={Boolean(row)} onOpenChange={props.onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>{row?.name ?? tr(props.locale, 'Metric details', '指标详情')}</SheetTitle>
					<SheetDescription className="font-mono">{row?.code}</SheetDescription>
				</SheetHeader>
				{row ? (
					<div className="grid gap-4 p-4">
						<DetailItem
							label={tr(props.locale, 'Type / status', '类型 / 状态')}
							value={`${row.type} · ${row.status}`}
						/>
						<DetailItem label={tr(props.locale, 'Semantic model', '语义模型')} value={row.modelName} />
						<DetailItem label={tr(props.locale, 'Cube', 'Cube')} value={row.entity} />
						<DetailItem label={tr(props.locale, 'Business area', '业务域')} value={row.businessAreaName} />
						<DetailItem label={tr(props.locale, 'Business definition', '业务口径')} value={row.business} />
						<DetailItem label={tr(props.locale, 'Principal', '负责人')} value={row.principal} />
						<DetailItem label={tr(props.locale, 'Certification', '认证')} value={row.certificationName} />
						<DetailItem label={tr(props.locale, 'Validity', '有效期')} value={row.validity} />
						<DetailItem
							label={tr(props.locale, 'Embedding status', '向量状态')}
							value={row.embeddingStatus}
						/>
						{row.error ? <DetailItem label={tr(props.locale, 'Error', '错误')} value={row.error} /> : null}
						<div>
							<div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{tr(props.locale, 'Semantic options', '语义选项')}
							</div>
							<pre className="overflow-auto rounded-md border bg-muted/20 p-3 text-xs">
								{JSON.stringify(row.options ?? {}, null, 2)}
							</pre>
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	)
}

function DetailItem(props: { label: string; value?: string }) {
	return (
		<div>
			<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.label}</div>
			<div className="mt-1 whitespace-pre-wrap text-sm">{props.value || '—'}</div>
		</div>
	)
}

function StatusBadge(props: { value: string }) {
	return (
		<Badge variant={props.value === 'RELEASED' ? 'default' : props.value === 'ARCHIVED' ? 'secondary' : 'outline'}>
			{props.value}
		</Badge>
	)
}

function withQueryParameter(query: JsonObject, key: string, value: string): JsonObject {
	const parameters = { ...(readObject(query, 'parameters') ?? {}) }
	if (value) {
		parameters[key] = value
	} else {
		delete parameters[key]
	}
	return { ...query, parameters }
}

function formatDate(value: string | undefined, locale?: string) {
	if (!value) {
		return '—'
	}
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(locale ?? 'en-US', {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(date)
}

function downloadText(fileName: string, content: string, mimeType: string) {
	const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = fileName
	anchor.click()
	URL.revokeObjectURL(url)
}

const rootElement = document.getElementById('root')
if (!rootElement) {
	throw new Error('Remote component root was not found.')
}
createRoot(rootElement).render(<MetricManagementApp />)
bridge.ready()
