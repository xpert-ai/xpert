import * as React from 'react'
import {
	Blocks,
	Box,
	Minus,
	PanelLeftClose,
	PanelLeftOpen,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	Table2
} from 'lucide-react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
	Button,
	cn,
	Input,
	Label,
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
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
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { ERDiagram, ERDiagramHandle } from './er-diagram'
import {
	buildGraph,
	fieldSelectionId,
	replaceSelectionValue,
	selectionNode,
	selectionNodeId,
	selectionValue,
	StudioEdge,
	StudioField,
	StudioNode,
	StudioSelection
} from './er-diagram-model'
import { FieldPropertyInspector } from './field-property-inspector'
import { createRelationshipI18n, RelationshipI18n } from './relationship-i18n'
import {
	localized,
	objectCollection,
	readFactTableName,
	readFirstTableName,
	replaceAt,
	replaceCollection,
	setFactTableName,
	setFirstTableName,
	setObjectValue,
	StudioIssue
} from './schema-utils'
import { useCollapsiblePanel, useMediaQuery } from './studio-layout'
import { QueryResult, QueryRun, Section, WorkspaceDetail } from './studio-types'

export function RelationshipStudio(props: {
	workspace: WorkspaceDetail
	schema: JsonObject
	tables: string[]
	issues: StudioIssue[]
	queryResult: QueryResult | null
	queryRuns: QueryRun[]
	queryRunning: boolean
	locale?: string
	onChange(schema: JsonObject): void
	onNavigate(section: Section): void
	onLoadTables(): void
	onRunQuery(cubeName: string, statement: string): void
}) {
	const dimensions = objectCollection(props.schema, 'dimensions')
	const cubes = objectCollection(props.schema, 'cubes')
	const [selection, setSelection] = React.useState<StudioSelection | null>(() =>
		cubes.length ? { kind: 'cube', index: 0 } : dimensions.length ? { kind: 'dimension', index: 0 } : null
	)
	const [assetFilter, setAssetFilter] = React.useState('')
	const [bottomTab, setBottomTab] = React.useState('validation')
	const [viewMode, setViewMode] = React.useState<'relationships' | 'cube'>('relationships')
	const [inspectorOpen, setInspectorOpen] = React.useState(false)
	const [inspectorTab, setInspectorTab] = React.useState('properties')
	const assetPanel = useCollapsiblePanel()
	const inspectorPanel = useCollapsiblePanel()
	const wideInspector = useMediaQuery('(min-width: 1180px)')
	const diagramRef = React.useRef<ERDiagramHandle | null>(null)
	const [graphZoom, setGraphZoom] = React.useState(1)
	const { nodes, edges } = React.useMemo(() => buildGraph(props.schema), [props.schema])
	const selectedNodeSelection = selectionNode(selection)
	const selectedNode = selectedNodeSelection
		? nodes.find((node) => node.kind === selectedNodeSelection.kind && node.index === selectedNodeSelection.index)
		: undefined
	const selectedField =
		selection?.kind === 'field'
			? selectedNode?.fields.find((field) => field.id === fieldSelectionId(selection))
			: undefined
	const selectedObject = selectionValue(props.schema, selection)
	const relationshipI18n = React.useMemo(() => createRelationshipI18n(props.locale), [props.locale])
	const sourceTables = React.useMemo(
		() => collectSourceTables(props.schema, props.tables),
		[props.schema, props.tables]
	)
	const normalizedFilter = assetFilter.trim().toLowerCase()
	const visibleNodes = normalizedFilter
		? nodes.filter((node) => `${node.name} ${node.subtitle}`.toLowerCase().includes(normalizedFilter))
		: nodes
	React.useEffect(() => {
		if (!selection && nodes[0]) {
			setSelection({ kind: nodes[0].kind, index: nodes[0].index })
			return
		}
		if (selection && !nodes.some((node) => node.id === selectionNodeId(selection))) {
			const fallback = nodes[0]
			setSelection(fallback ? { kind: fallback.kind, index: fallback.index } : null)
			return
		}
		if (selection?.kind === 'field' && !selectedField) {
			setSelection(selectedNode ? { kind: selectedNode.kind, index: selectedNode.index } : null)
		}
	}, [nodes, selectedField, selectedNode, selection])

	function selectNode(node: StudioNode) {
		setSelection({ kind: node.kind, index: node.index })
	}

	function updateSelected(key: string, value: JsonValue | undefined) {
		if (!selection || !selectedObject) {
			return
		}
		props.onChange(replaceSelectionValue(props.schema, selection, setObjectValue(selectedObject, key, value)))
	}

	function updateSelectedTable(tableName: string) {
		if (!selectedNodeSelection || !selectedObject || selection?.kind === 'field') {
			return
		}
		if (selectedNodeSelection.kind === 'cube') {
			props.onChange(
				replaceCollection(
					props.schema,
					'cubes',
					replaceAt(cubes, selectedNodeSelection.index, setFactTableName(selectedObject, tableName))
				)
			)
			return
		}
		const hierarchies = objectCollection(selectedObject, 'hierarchies')
		const hierarchy = hierarchies[0] ?? {}
		const nextDimension = replaceCollection(
			selectedObject,
			'hierarchies',
			hierarchies.length
				? replaceAt(hierarchies, 0, setFirstTableName(hierarchy, tableName))
				: [setFirstTableName({}, tableName)]
		)
		props.onChange(
			replaceCollection(
				props.schema,
				'dimensions',
				replaceAt(dimensions, selectedNodeSelection.index, nextDimension)
			)
		)
	}

	const blockingCount = props.issues.filter((issue) => issue.level === 'error').length
	const warningCount = props.issues.filter((issue) => issue.level === 'warning').length

	return (
		<>
			<ResizablePanelGroup
				id="semantic-relationship-shell"
				orientation="horizontal"
				className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
			>
				<ResizablePanel
					id="semantic-assets"
					defaultSize={220}
					minSize={184}
					maxSize={360}
					collapsible
					collapsedSize={0}
					groupResizeBehavior="preserve-pixel-size"
					panelRef={assetPanel.panelRef}
					onResize={assetPanel.onResize}
				>
					<aside className="flex h-full min-h-0 flex-col bg-card/70">
						<div className="border-b px-3 py-2.5">
							<div className="flex items-start gap-2">
								<div className="min-w-0 flex-1">
									<div className="text-sm font-semibold">
										{localized(props.locale, 'Model assets', '模型资产')}
									</div>
									<div className="mt-0.5 text-[11px] text-muted-foreground">
										{localized(props.locale, 'Draft', '草稿')} v
										{props.workspace.model.draftVersion ?? 0}
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={localized(props.locale, 'Collapse model assets', '收起模型资产')}
									title={localized(props.locale, 'Collapse model assets', '收起模型资产')}
									onClick={assetPanel.toggle}
								>
									<PanelLeftClose aria-hidden="true" />
								</Button>
							</div>
							<Input
								className="mt-2.5 h-8 text-xs"
								value={assetFilter}
								placeholder={localized(props.locale, 'Filter assets', '筛选模型资产')}
								onChange={(event) => setAssetFilter(event.currentTarget.value)}
							/>
						</div>
						<ScrollArea className="min-h-0 flex-1">
							<div className="p-2">
								<AssetGroup
									label={localized(props.locale, 'Source tables', '源表')}
									count={sourceTables.length}
								>
									{sourceTables.map((table) => (
										<Button
											key={table}
											variant="ghost"
											size="sm"
											className="w-full justify-start px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
											onClick={() => {
												props.onNavigate('sources')
											}}
										>
											<AssetMark kind="table" />
											<span className="min-w-0 flex-1 truncate">{table}</span>
										</Button>
									))}
									{!props.tables.length ? (
										<Button
											variant="ghost"
											size="sm"
											className="mt-1 w-full justify-start"
											onClick={props.onLoadTables}
										>
											{localized(props.locale, 'Load source catalog', '加载源表目录')}
										</Button>
									) : null}
								</AssetGroup>
								<AssetGroup
									label={localized(props.locale, 'Shared dimensions', '共享维度')}
									count={dimensions.length}
								>
									{visibleNodes
										.filter((node) => node.kind === 'dimension')
										.map((node) => (
											<AssetButton
												key={node.id}
												node={node}
												active={selectedNode?.id === node.id}
												onClick={() => selectNode(node)}
											/>
										))}
								</AssetGroup>
								<AssetGroup label={localized(props.locale, 'Cubes', 'Cube')} count={cubes.length}>
									{visibleNodes
										.filter((node) => node.kind === 'cube')
										.map((node) => (
											<AssetButton
												key={node.id}
												node={node}
												active={selectedNode?.id === node.id}
												onClick={() => selectNode(node)}
											/>
										))}
								</AssetGroup>
							</div>
						</ScrollArea>
						<div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
							<span>{localized(props.locale, 'Source connected', '数据源连接正常')}</span>
							<span>{sourceTables.length}</span>
						</div>
					</aside>
				</ResizablePanel>
				<ResizableHandle
					id="semantic-assets-resize"
					withHandle
					className="z-20 hover:bg-ring/40 data-[resize-handle-active]:bg-ring"
				/>
				<ResizablePanel id="semantic-workspace" minSize="42%">
					<section className="flex h-full min-h-0 min-w-0 flex-col">
						<div className="flex h-11 shrink-0 items-center justify-between gap-1 border-b px-3">
							<div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
								{assetPanel.collapsed ? (
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={localized(props.locale, 'Expand model assets', '展开模型资产')}
										title={localized(props.locale, 'Expand model assets', '展开模型资产')}
										onClick={assetPanel.toggle}
									>
										<PanelLeftOpen aria-hidden="true" />
									</Button>
								) : null}
								<Tabs
									value={viewMode}
									onValueChange={(value) => setViewMode(value as typeof viewMode)}
									className="min-w-0 flex-1 overflow-hidden"
								>
									<TabsList
										variant="line"
										className="h-10 max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
									>
										<TabsTrigger value="relationships" className="text-xs">
											{localized(props.locale, 'ER diagram', 'ER 图')}
										</TabsTrigger>
										<TabsTrigger value="cube" className="text-xs">
											{localized(props.locale, 'Cube structure', 'Cube 结构')}
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</div>
							<div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
								{viewMode === 'relationships' ? (
									<>
										<Button
											variant="ghost"
											size="xs"
											className="max-[899px]:hidden"
											onClick={() => diagramRef.current?.autoLayout()}
										>
											{localized(props.locale, 'Auto layout', '自动布局')}
										</Button>
										<Button
											variant="ghost"
											size="xs"
											className="max-[899px]:hidden"
											onClick={() => diagramRef.current?.fit()}
										>
											{localized(props.locale, 'Fit', '适配')}
										</Button>
									</>
								) : null}
								<Button
									variant="outline"
									size="icon-sm"
									className="min-[1180px]:hidden"
									aria-label={localized(props.locale, 'Open properties', '打开属性')}
									title={localized(props.locale, 'Open properties', '打开属性')}
									disabled={!selectedNode}
									onClick={() => setInspectorOpen(true)}
								>
									<PanelRightOpen aria-hidden="true" />
								</Button>
								{wideInspector && inspectorPanel.collapsed ? (
									<Button
										variant="outline"
										size="icon-sm"
										aria-label={localized(props.locale, 'Expand properties', '展开属性')}
										title={localized(props.locale, 'Expand properties', '展开属性')}
										disabled={!selectedNode}
										onClick={inspectorPanel.toggle}
									>
										<PanelRightOpen aria-hidden="true" />
									</Button>
								) : null}
							</div>
						</div>
						<ResizablePanelGroup
							id="semantic-canvas-dock"
							orientation="vertical"
							className="min-h-0 flex-1"
						>
							<ResizablePanel id="semantic-canvas" minSize={260}>
								<div className="relative h-full min-h-0 overflow-hidden bg-muted/10">
									{viewMode === 'cube' ? (
										<CubeStructureView
											schema={props.schema}
											selectedCubeIndex={
												selectedNodeSelection?.kind === 'cube' ? selectedNodeSelection.index : 0
											}
											locale={props.locale}
											onEdit={() => props.onNavigate('relationships')}
										/>
									) : nodes.length ? (
										<ERDiagram
											ref={diagramRef}
											nodes={nodes}
											edges={edges}
											selection={selection}
											i18n={relationshipI18n}
											onSelectNode={selectNode}
											onSelectField={(field) => setSelection(field.selection)}
											onClearSelection={() => setSelection(null)}
											onZoomChange={setGraphZoom}
										/>
									) : (
										<div className="grid h-full place-items-center p-8 text-center">
											<div>
												<div className="text-sm font-medium">
													{localized(
														props.locale,
														'No semantic assets yet',
														'还没有语义对象'
													)}
												</div>
												<p className="mt-1 max-w-sm text-xs text-muted-foreground">
													{localized(
														props.locale,
														'Create a dimension or Cube from a source table to start the relationship map.',
														'从源表创建维度或 Cube，即可开始绘制关系图。'
													)}
												</p>
												<Button
													className="mt-3"
													size="sm"
													onClick={() => props.onNavigate('sources')}
												>
													{localized(props.locale, 'Browse source tables', '浏览源表')}
												</Button>
											</div>
										</div>
									)}
									{viewMode === 'relationships' ? (
										<div className="absolute bottom-3 right-3 flex items-center rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={localized(props.locale, 'Zoom out', '缩小')}
												onClick={() => diagramRef.current?.zoomBy(0.84)}
											>
												<Minus aria-hidden="true" />
											</Button>
											<span className="w-11 text-center text-[10px] text-muted-foreground">
												{Math.round(graphZoom * 100)}%
											</span>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={localized(props.locale, 'Zoom in', '放大')}
												onClick={() => diagramRef.current?.zoomBy(1.18)}
											>
												<Plus aria-hidden="true" />
											</Button>
										</div>
									) : null}
								</div>
							</ResizablePanel>
							<ResizableHandle
								id="semantic-dock-resize"
								withHandle
								className="z-20 hover:bg-ring/40 data-[resize-handle-active]:bg-ring"
							/>
							<ResizablePanel
								id="semantic-dock"
								defaultSize={190}
								minSize={116}
								maxSize={420}
								groupResizeBehavior="preserve-pixel-size"
							>
								<div className="h-full bg-card/80">
									<Tabs value={bottomTab} onValueChange={setBottomTab} className="h-full gap-0">
										<div className="flex h-10 items-center border-b px-3">
											<TabsList variant="line" className="h-9">
												<TabsTrigger value="validation" className="text-xs">
													{localized(props.locale, 'Validation', '验证')}
													{blockingCount || warningCount ? (
														<Badge
															variant={blockingCount ? 'destructive' : 'secondary'}
															className="ml-1 h-5 px-1.5 text-[10px]"
														>
															{blockingCount + warningCount}
														</Badge>
													) : null}
												</TabsTrigger>
												<TabsTrigger value="preview" className="text-xs">
													{localized(props.locale, 'Data preview', '数据预览')}
												</TabsTrigger>
												<TabsTrigger value="query" className="text-xs">
													Query Lab
												</TabsTrigger>
												<TabsTrigger value="history" className="text-xs">
													{localized(props.locale, 'Run history', '执行记录')}
												</TabsTrigger>
											</TabsList>
										</div>
										<TabsContent value="validation" className="min-h-0 overflow-auto">
											<ValidationDock
												issues={props.issues}
												locale={props.locale}
												onOpen={() => props.onNavigate('validation')}
											/>
										</TabsContent>
										<TabsContent value="preview" className="min-h-0 overflow-auto">
											<DataPreviewDock result={props.queryResult} locale={props.locale} />
										</TabsContent>
										<TabsContent value="query" className="min-h-0 overflow-auto">
											<QueryDock
												schema={props.schema}
												result={props.queryResult}
												running={props.queryRunning}
												locale={props.locale}
												onRun={props.onRunQuery}
												onOpenLab={() => props.onNavigate('queryLab')}
											/>
										</TabsContent>
										<TabsContent value="history" className="min-h-0 overflow-auto">
											<RunHistoryDock runs={props.queryRuns} locale={props.locale} />
										</TabsContent>
									</Tabs>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</section>
				</ResizablePanel>

				{wideInspector ? (
					<>
						<ResizableHandle
							id="semantic-inspector-resize"
							withHandle
							className="z-20 hover:bg-ring/40 data-[resize-handle-active]:bg-ring"
						/>
						<ResizablePanel
							id="semantic-inspector"
							defaultSize={300}
							minSize={260}
							maxSize={480}
							collapsible
							collapsedSize={0}
							groupResizeBehavior="preserve-pixel-size"
							panelRef={inspectorPanel.panelRef}
							onResize={inspectorPanel.onResize}
						>
							<aside className="h-full min-h-0 bg-card/80">
								<Tabs defaultValue="properties" className="h-full gap-0">
									<div className="flex h-11 items-center justify-between border-b px-3">
										<TabsList variant="line" className="h-10">
											<TabsTrigger value="properties" className="text-xs">
												{localized(props.locale, 'Properties', '属性')}
											</TabsTrigger>
											<TabsTrigger value="dependencies" className="text-xs">
												{localized(props.locale, 'Dependencies', '依赖')}
											</TabsTrigger>
											<TabsTrigger value="agent" className="text-xs">
												Agent
											</TabsTrigger>
										</TabsList>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={localized(props.locale, 'Collapse properties', '收起属性')}
											title={localized(props.locale, 'Collapse properties', '收起属性')}
											onClick={inspectorPanel.toggle}
										>
											<PanelRightClose aria-hidden="true" />
										</Button>
									</div>
									<TabsContent value="properties" className="min-h-0">
										<PropertyInspector
											node={selectedNode}
											field={selectedField}
											value={selectedObject}
											sourceTables={sourceTables}
											locale={props.locale}
											i18n={relationshipI18n}
											onUpdate={updateSelected}
											onUpdateTable={updateSelectedTable}
										/>
									</TabsContent>
									<TabsContent value="dependencies" className="min-h-0">
										<DependencyInspector
											node={selectedNode}
											nodes={nodes}
											edges={edges}
											locale={props.locale}
										/>
									</TabsContent>
									<TabsContent value="agent" className="min-h-0">
										<AgentInspector
											node={selectedNode}
											value={selectedObject}
											issues={props.issues}
											queryRuns={props.queryRuns}
											locale={props.locale}
											onUpdate={updateSelected}
										/>
									</TabsContent>
								</Tabs>
							</aside>
						</ResizablePanel>
					</>
				) : null}
			</ResizablePanelGroup>
			<Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
				<SheetContent className="w-[360px] gap-0 p-0 sm:max-w-[360px]">
					<SheetHeader className="border-b">
						<SheetTitle>
							{selectedField
								? relationshipI18n.t('fieldProperties')
								: localized(props.locale, 'Object properties', '对象属性')}
						</SheetTitle>
						<SheetDescription>
							{selectedField
								? relationshipI18n.t('fieldPropertiesDescription')
								: localized(
										props.locale,
										'Edit the selected semantic object without leaving the relationship map.',
										'无需离开关系图即可编辑所选语义对象。'
									)}
						</SheetDescription>
					</SheetHeader>
					<Tabs value={inspectorTab} onValueChange={setInspectorTab} className="min-h-0 flex-1 gap-0">
						<div className="border-b px-4">
							<TabsList variant="line" className="h-10">
								<TabsTrigger value="properties" className="text-xs">
									{localized(props.locale, 'Properties', '属性')}
								</TabsTrigger>
								<TabsTrigger value="dependencies" className="text-xs">
									{localized(props.locale, 'Dependencies', '依赖')}
								</TabsTrigger>
								<TabsTrigger value="agent" className="text-xs">
									Agent
								</TabsTrigger>
							</TabsList>
						</div>
						<TabsContent value="properties" className="min-h-0">
							<PropertyInspector
								node={selectedNode}
								field={selectedField}
								value={selectedObject}
								sourceTables={sourceTables}
								locale={props.locale}
								i18n={relationshipI18n}
								onUpdate={updateSelected}
								onUpdateTable={updateSelectedTable}
							/>
						</TabsContent>
						<TabsContent value="dependencies" className="min-h-0">
							<DependencyInspector
								node={selectedNode}
								nodes={nodes}
								edges={edges}
								locale={props.locale}
							/>
						</TabsContent>
						<TabsContent value="agent" className="min-h-0">
							<AgentInspector
								node={selectedNode}
								value={selectedObject}
								issues={props.issues}
								queryRuns={props.queryRuns}
								locale={props.locale}
								onUpdate={updateSelected}
							/>
						</TabsContent>
					</Tabs>
				</SheetContent>
			</Sheet>
		</>
	)
}

function AssetGroup(props: { label: string; count: number; children: React.ReactNode }) {
	return (
		<div className="mb-3">
			<div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				<span>{props.label}</span>
				<span>{props.count}</span>
			</div>
			<div className="space-y-0.5">{props.children}</div>
		</div>
	)
}

function AssetButton(props: { node: StudioNode; active: boolean; onClick(): void }) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				'w-full justify-start px-2 text-xs',
				props.active &&
					'bg-accent text-accent-foreground shadow-xs hover:bg-accent hover:text-accent-foreground'
			)}
			onClick={props.onClick}
		>
			<AssetMark kind={props.node.kind} />
			<span className="min-w-0 flex-1 truncate">{props.node.name}</span>
			<span className="text-[10px] font-normal text-muted-foreground">{props.node.fields.length}</span>
		</Button>
	)
}

function AssetMark(props: { kind: StudioNode['kind'] | 'table' }) {
	return (
		<span className="grid size-5 shrink-0 place-items-center rounded border bg-background text-muted-foreground">
			{props.kind === 'table' ? (
				<Table2 className="size-3" aria-hidden="true" />
			) : props.kind === 'cube' ? (
				<Blocks className="size-3" aria-hidden="true" />
			) : (
				<Box className="size-3" aria-hidden="true" />
			)}
		</span>
	)
}

function ValidationDock(props: { issues: StudioIssue[]; locale?: string; onOpen(): void }) {
	const errors = props.issues.filter((issue) => issue.level === 'error').length
	const warnings = props.issues.filter((issue) => issue.level === 'warning').length
	return (
		<div className="grid min-h-[148px] grid-cols-[190px_minmax(0,1fr)] max-[820px]:grid-cols-[145px_minmax(0,1fr)]">
			<div className="border-r p-3">
				<div className="text-sm font-semibold">{localized(props.locale, 'Publish gate', '发布门禁')}</div>
				<div className="mt-1 text-xs text-muted-foreground">
					{errors
						? localized(props.locale, `${errors} blocking issues`, `${errors} 个阻塞项`)
						: localized(props.locale, 'No blocking issues', '没有阻塞项')}
					{warnings ? localized(props.locale, ` · ${warnings} warnings`, ` · ${warnings} 个警告`) : ''}
				</div>
				<Button variant="link" size="sm" className="mt-3 h-auto p-0" onClick={props.onOpen}>
					{localized(props.locale, 'Open validation report', '打开完整校验报告')}
				</Button>
			</div>
			<div className="divide-y">
				{props.issues.slice(0, 3).map((issue, index) => (
					<button
						key={`${issue.location}:${index}`}
						type="button"
						className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
						onClick={props.onOpen}
					>
						<Badge
							variant={
								issue.level === 'error'
									? 'destructive'
									: issue.level === 'success'
										? 'default'
										: 'secondary'
							}
							className="w-16 justify-center text-[10px]"
						>
							{issue.level}
						</Badge>
						<div className="min-w-0">
							<div className="truncate text-xs font-medium">{issue.message}</div>
							<div className="truncate font-mono text-[10px] text-muted-foreground">{issue.location}</div>
						</div>
					</button>
				))}
			</div>
		</div>
	)
}

function DockEmpty(props: { title: string; description: string; action?: string; onAction?(): void }) {
	return (
		<div className="flex min-h-[148px] items-center justify-between gap-4 px-5 py-4">
			<div>
				<div className="text-sm font-medium">{props.title}</div>
				<p className="mt-1 max-w-xl text-xs text-muted-foreground">{props.description}</p>
			</div>
			{props.action && props.onAction ? (
				<Button variant="outline" size="sm" onClick={props.onAction}>
					{props.action}
				</Button>
			) : null}
		</div>
	)
}

function CubeStructureView(props: { schema: JsonObject; selectedCubeIndex: number; locale?: string; onEdit(): void }) {
	const cubes = objectCollection(props.schema, 'cubes')
	const cube = cubes[props.selectedCubeIndex] ?? cubes[0]
	if (!cube) {
		return (
			<div className="grid h-full place-items-center text-xs text-muted-foreground">
				{localized(props.locale, 'Create a Cube to inspect its structure.', '创建 Cube 后即可查看结构。')}
			</div>
		)
	}
	const usages = [...objectCollection(cube, 'dimensionUsages'), ...objectCollection(cube, 'dimensions')]
	const measures = objectCollection(cube, 'measures')
	const name = readString(cube, 'caption') ?? readString(cube, 'name') ?? 'Cube'
	return (
		<ScrollArea className="h-full">
			<div className="space-y-4 p-5">
				<div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
					<div>
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
							Cube structure
						</div>
						<div className="mt-1 text-lg font-semibold">{name}</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{readFactTableName(cube) ||
								localized(props.locale, 'Fact source not configured', '尚未配置事实来源')}
						</div>
					</div>
					<Button variant="outline" size="sm" onClick={props.onEdit}>
						{localized(props.locale, 'Edit Cube', '编辑 Cube')}
					</Button>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div className="overflow-hidden rounded-lg border bg-card">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<div className="text-sm font-semibold">
								{localized(props.locale, 'Dimension usages', '维度用法')}
							</div>
							<Badge variant="secondary">{usages.length}</Badge>
						</div>
						<div className="divide-y">
							{usages.map((usage, index) => (
								<div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
									<div className="min-w-0">
										<div className="truncate text-xs font-medium">
											{readString(usage, 'name') ??
												readString(usage, 'source') ??
												readString(usage, 'sharedDimension') ??
												`#${index + 1}`}
										</div>
										<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
											{readString(usage, 'foreignKey') ??
												localized(props.locale, 'Local dimension', '本地维度')}
										</div>
									</div>
									<span className="text-[10px] text-muted-foreground">
										{readString(usage, 'source')
											? localized(props.locale, 'Shared', '共享')
											: localized(props.locale, 'Local', '本地')}
									</span>
								</div>
							))}
							{!usages.length ? (
								<div className="px-4 py-8 text-center text-xs text-muted-foreground">
									{localized(props.locale, 'No dimension usages', '尚未配置维度用法')}
								</div>
							) : null}
						</div>
					</div>
					<div className="overflow-hidden rounded-lg border bg-card">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<div className="text-sm font-semibold">{localized(props.locale, 'Measures', '度量')}</div>
							<Badge variant="secondary">{measures.length}</Badge>
						</div>
						<div className="divide-y">
							{measures.map((measure, index) => (
								<div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
									<div className="min-w-0">
										<div className="truncate text-xs font-medium">
											{readString(measure, 'caption') ??
												readString(measure, 'name') ??
												`#${index + 1}`}
										</div>
										<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
											{readString(measure, 'column') ?? readString(measure, 'formula') ?? '—'}
										</div>
									</div>
									<Badge
										variant={
											readString(cube, 'defaultMeasure') === readString(measure, 'name')
												? 'default'
												: 'outline'
										}
									>
										{readString(measure, 'aggregator') ?? 'sum'}
									</Badge>
								</div>
							))}
							{!measures.length ? (
								<div className="px-4 py-8 text-center text-xs text-muted-foreground">
									{localized(props.locale, 'No measures', '尚未配置度量')}
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</ScrollArea>
	)
}

function DataPreviewDock(props: { result: QueryResult | null; locale?: string }) {
	if (!props.result) {
		return (
			<DockEmpty
				title={localized(props.locale, 'No preview result yet', '暂无数据预览结果')}
				description={localized(
					props.locale,
					'Run an MDX query in Query Lab; the real result will also appear here for rapid modeling validation.',
					'请在 Query Lab 运行 MDX，真实结果也会在此显示，便于快速验证建模。'
				)}
			/>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow className="bg-muted/35">
					{props.result.columns.map((column) => (
						<TableHead key={column.name} className="h-8 min-w-32 whitespace-nowrap text-[10px]">
							{column.name}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{props.result.rows.slice(0, 4).map((row, rowIndex) => (
					<TableRow key={rowIndex}>
						{props.result?.columns.map((column) => (
							<TableCell key={`${rowIndex}:${column.name}`} className="h-8 max-w-60 truncate text-[10px]">
								{formatDockCell(row[column.name])}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function QueryDock(props: {
	schema: JsonObject
	result: QueryResult | null
	running: boolean
	locale?: string
	onRun(cubeName: string, statement: string): void
	onOpenLab(): void
}) {
	const cubeNames = objectCollection(props.schema, 'cubes')
		.map((cube) => readString(cube, 'name') ?? readString(cube, 'caption') ?? '')
		.filter(Boolean)
	const [cubeName, setCubeName] = React.useState(cubeNames[0] ?? '')
	const [statement, setStatement] = React.useState(
		`SELECT [Measures].Members ON COLUMNS FROM [${cubeNames[0] ?? 'Cube'}]`
	)
	return (
		<div className="grid min-h-[148px] grid-cols-[118px_minmax(150px,.8fr)_minmax(180px,1.2fr)] gap-3 p-3">
			<div className="space-y-2">
				<Label className="text-[10px] text-muted-foreground">Cube</Label>
				<Select
					value={cubeName}
					onValueChange={(value) => {
						setCubeName(value)
						setStatement(`SELECT [Measures].Members ON COLUMNS FROM [${value}]`)
					}}
				>
					<SelectTrigger className="h-8 text-xs">
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
				<Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={props.onOpenLab}>
					{localized(props.locale, 'Open full Query Lab', '打开完整 Query Lab')}
				</Button>
				<Button
					size="sm"
					className="h-7 w-full"
					disabled={!cubeName || !statement.trim() || props.running}
					onClick={() => props.onRun(cubeName, statement)}
				>
					{props.running
						? localized(props.locale, 'Running…', '运行中…')
						: localized(props.locale, 'Run', '运行')}
				</Button>
			</div>
			<Textarea
				className="h-[122px] resize-none bg-zinc-950 font-mono text-[10px] leading-5 text-zinc-100"
				value={statement}
				onChange={(event) => setStatement(event.currentTarget.value)}
			/>
			<div className="min-w-0 overflow-auto rounded-md border bg-background">
				{props.result ? (
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/35">
								{props.result.columns.map((column) => (
									<TableHead
										key={column.name}
										className="h-7 min-w-24 whitespace-nowrap px-2 text-[9px]"
									>
										{column.name}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{props.result.rows.slice(0, 2).map((row, rowIndex) => (
								<TableRow key={rowIndex}>
									{props.result?.columns.map((column) => (
										<TableCell
											key={`${rowIndex}:${column.name}`}
											className="h-8 whitespace-nowrap px-2 text-[9px]"
										>
											{formatDockCell(row[column.name])}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<div className="grid h-full min-h-28 place-items-center px-3 text-center text-[10px] text-muted-foreground">
						{localized(props.locale, 'Run to inspect real rows.', '运行后查看真实结果。')}
					</div>
				)}
			</div>
		</div>
	)
}

function RunHistoryDock(props: { runs: QueryRun[]; locale?: string }) {
	if (!props.runs.length) {
		return (
			<DockEmpty
				title={localized(props.locale, 'No runs in this session', '当前会话暂无执行记录')}
				description={localized(
					props.locale,
					'Query runs from this Studio session will appear here with row counts and latency.',
					'当前 Studio 会话的查询会在此显示结果行数与耗时。'
				)}
			/>
		)
	}
	return (
		<div className="divide-y">
			{props.runs.slice(0, 4).map((run) => (
				<div
					key={run.id}
					className="grid grid-cols-[90px_minmax(0,1fr)_70px_80px] items-center gap-3 px-4 py-2 text-[10px]"
				>
					<div className="font-medium">{run.cubeName}</div>
					<div className="truncate font-mono text-muted-foreground">{run.statement}</div>
					<Badge
						variant={
							run.status === 'error' ? 'destructive' : run.status === 'success' ? 'default' : 'secondary'
						}
					>
						{run.status}
					</Badge>
					<div className="text-right text-muted-foreground">
						{typeof run.durationMs === 'number' ? `${run.durationMs} ms` : '—'}
					</div>
				</div>
			))}
		</div>
	)
}

function formatDockCell(value: unknown) {
	if (value === null || value === undefined) {
		return '—'
	}
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function PropertyInspector(props: {
	node?: StudioNode
	field?: StudioField
	value?: JsonObject
	sourceTables: string[]
	locale?: string
	i18n: RelationshipI18n
	onUpdate(key: string, value: JsonValue | undefined): void
	onUpdateTable(value: string): void
}) {
	if (!props.node || !props.value) {
		return <InspectorEmpty locale={props.locale} />
	}
	if (props.field) {
		return (
			<FieldPropertyInspector
				field={props.field}
				value={props.value}
				sourceTables={props.sourceTables}
				i18n={props.i18n}
				onUpdate={props.onUpdate}
			/>
		)
	}
	const tableName =
		props.node.kind === 'cube'
			? readFactTableName(props.value)
			: readFirstTableName(objectCollection(props.value, 'hierarchies')[0] ?? {})
	return (
		<ScrollArea className="h-full">
			<div className="border-b p-4">
				<div className="flex items-center gap-3">
					<span className="grid size-9 place-items-center rounded-lg border bg-primary/10 font-mono text-sm font-semibold text-primary">
						{props.node.kind === 'cube' ? 'F' : 'D'}
					</span>
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold">{props.node.name}</div>
						<div className="text-xs text-muted-foreground">{props.node.subtitle}</div>
					</div>
				</div>
			</div>
			<Accordion type="multiple" defaultValue={['basic', 'source', 'semantic']} className="px-4">
				<AccordionItem value="basic">
					<AccordionTrigger className="text-xs">
						{localized(props.locale, 'Basic information', '基本信息')}
					</AccordionTrigger>
					<AccordionContent className="space-y-3">
						<InspectorField label={localized(props.locale, 'Name', '名称')}>
							<Input
								value={readString(props.value, 'name') ?? ''}
								onChange={(event) => props.onUpdate('name', event.currentTarget.value)}
							/>
						</InspectorField>
						<InspectorField label={localized(props.locale, 'Caption', '显示名称')}>
							<Input
								value={readString(props.value, 'caption') ?? ''}
								onChange={(event) => props.onUpdate('caption', event.currentTarget.value)}
							/>
						</InspectorField>
						<InspectorField label={localized(props.locale, 'Description', '说明')}>
							<Textarea
								className="min-h-20 text-xs"
								value={readString(props.value, 'description') ?? ''}
								onChange={(event) => props.onUpdate('description', event.currentTarget.value)}
							/>
						</InspectorField>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="source">
					<AccordionTrigger className="text-xs">
						{props.node.kind === 'cube'
							? localized(props.locale, 'Fact configuration', '事实配置')
							: localized(props.locale, 'Dimension source', '维度来源')}
					</AccordionTrigger>
					<AccordionContent className="space-y-3">
						<InspectorField label={localized(props.locale, 'Source table', '数据源表')}>
							<Select value={tableName} onValueChange={props.onUpdateTable}>
								<SelectTrigger>
									<SelectValue placeholder={localized(props.locale, 'Choose a table', '选择源表')} />
								</SelectTrigger>
								<SelectContent>
									{uniqueValues([tableName, ...props.sourceTables]).map((table) => (
										<SelectItem key={table} value={table}>
											{table}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</InspectorField>
						{props.node.kind === 'cube' ? (
							<InspectorField label={localized(props.locale, 'Default measure', '默认度量')}>
								<Select
									value={readString(props.value, 'defaultMeasure') ?? ''}
									onValueChange={(value) => props.onUpdate('defaultMeasure', value)}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={localized(props.locale, 'Choose a measure', '选择度量')}
										/>
									</SelectTrigger>
									<SelectContent>
										{objectCollection(props.value, 'measures').map((measure, index) => {
											const name = readString(measure, 'name') ?? `#${index + 1}`
											return (
												<SelectItem key={`${name}:${index}`} value={name}>
													{name}
												</SelectItem>
											)
										})}
									</SelectContent>
								</Select>
							</InspectorField>
						) : null}
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="semantic">
					<AccordionTrigger className="text-xs">
						{localized(props.locale, 'Agent-facing semantics', '面向 Agent 的语义')}
					</AccordionTrigger>
					<AccordionContent>
						<p className="text-xs leading-5 text-muted-foreground">
							{localized(
								props.locale,
								'Name, caption, description, levels, and measures are exposed to Agent tools as the governed semantic contract.',
								'名称、显示名称、业务说明、层级与度量会作为受治理的语义契约提供给 Agent 工具。'
							)}
						</p>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</ScrollArea>
	)
}

function DependencyInspector(props: { node?: StudioNode; nodes: StudioNode[]; edges: StudioEdge[]; locale?: string }) {
	if (!props.node) {
		return <InspectorEmpty locale={props.locale} />
	}
	const relatedEdges = props.edges.filter((edge) => edge.source === props.node?.id || edge.target === props.node?.id)
	return (
		<ScrollArea className="h-full">
			<div className="space-y-2 p-4">
				<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{localized(props.locale, 'Direct dependencies', '直接依赖')} · {relatedEdges.length}
				</div>
				{relatedEdges.map((edge) => {
					const relatedId = edge.source === props.node?.id ? edge.target : edge.source
					const related = props.nodes.find((node) => node.id === relatedId)
					return (
						<div key={edge.id} className="rounded-md border bg-background p-3">
							<div className="text-xs font-medium">{related?.name ?? relatedId}</div>
							<div className="mt-1 font-mono text-[10px] text-muted-foreground">{edge.label}</div>
						</div>
					)
				})}
				{!relatedEdges.length ? (
					<p className="text-xs text-muted-foreground">
						{localized(
							props.locale,
							'No direct relationship is defined for this object.',
							'当前对象尚未定义直接关系。'
						)}
					</p>
				) : null}
			</div>
		</ScrollArea>
	)
}

function AgentInspector(props: {
	node?: StudioNode
	value?: JsonObject
	issues: StudioIssue[]
	queryRuns: QueryRun[]
	locale?: string
	onUpdate(key: string, value: JsonValue | undefined): void
}) {
	if (!props.node || !props.value) {
		return <InspectorEmpty locale={props.locale} />
	}
	return (
		<ScrollArea className="h-full">
			<div className="space-y-4 p-4">
				<div>
					<div className="text-sm font-semibold">
						{localized(props.locale, 'Business context for Agent', '提供给 Agent 的业务上下文')}
					</div>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{localized(
							props.locale,
							'Use precise business language so autonomous modeling and query planning can choose the right object.',
							'使用明确的业务语言，帮助自主建模与查询规划准确选择对象。'
						)}
					</p>
				</div>
				<div className="space-y-2">
					<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						{localized(props.locale, 'Agent activity', 'Agent 活动')}
					</div>
					{props.queryRuns.slice(0, 2).map((run) => (
						<div key={run.id} className="rounded-md border bg-background p-3">
							<div className="flex items-center justify-between gap-2">
								<div className="text-xs font-medium">
									{localized(props.locale, 'Validated a real query', '已验证真实查询')}
								</div>
								<Badge variant={run.status === 'error' ? 'destructive' : 'secondary'}>
									{run.status}
								</Badge>
							</div>
							<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
								{run.cubeName}
							</div>
						</div>
					))}
					{props.issues
						.filter((issue) => issue.level !== 'success')
						.slice(0, 2)
						.map((issue, index) => (
							<div key={`${issue.location}:${index}`} className="rounded-md border bg-background p-3">
								<div className="text-xs font-medium">{issue.message}</div>
								<div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
									{issue.location}
								</div>
							</div>
						))}
					{!props.queryRuns.length && !props.issues.some((issue) => issue.level !== 'success') ? (
						<div className="rounded-md border bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
							{localized(
								props.locale,
								'The Agent and manual UI share this validated draft. No pending activity requires review.',
								'Agent 与人工 UI 共用当前已验证草稿，暂无待审阅活动。'
							)}
						</div>
					) : null}
				</div>
				<InspectorField label={localized(props.locale, 'Business description', '业务说明')}>
					<Textarea
						className="min-h-32 text-xs"
						value={readString(props.value, 'description') ?? ''}
						onChange={(event) => props.onUpdate('description', event.currentTarget.value)}
					/>
				</InspectorField>
				<div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
					{localized(
						props.locale,
						'Agent changes are synchronized through the same draft and validation contract as manual UI changes.',
						'Agent 修改与人工 UI 修改会通过同一份草稿和校验契约同步。'
					)}
				</div>
			</div>
		</ScrollArea>
	)
}

function InspectorEmpty(props: { locale?: string }) {
	return (
		<div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
			{localized(props.locale, 'Select a Cube or dimension to inspect it.', '选择一个 Cube 或维度以查看属性。')}
		</div>
	)
}

function InspectorField(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-1.5">
			<Label className="text-xs text-muted-foreground">{props.label}</Label>
			{props.children}
		</div>
	)
}

function collectSourceTables(schema: JsonObject, tables: string[]) {
	const values = [...tables]
	for (const dimension of objectCollection(schema, 'dimensions')) {
		for (const hierarchy of objectCollection(dimension, 'hierarchies')) {
			values.push(readFirstTableName(hierarchy))
		}
	}
	for (const cube of objectCollection(schema, 'cubes')) {
		values.push(readFactTableName(cube))
	}
	return uniqueValues(values)
}

function uniqueValues(values: string[]) {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
