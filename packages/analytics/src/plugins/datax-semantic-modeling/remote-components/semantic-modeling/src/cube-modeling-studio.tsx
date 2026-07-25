import * as React from 'react'
import {
	Button,
	cn,
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
	Tooltip,
	TooltipContent,
	TooltipTrigger
} from '@xpert-ai/shadcn-ui'
import { ArrowLeftRight, Box, CheckCircle2, Focus, GitBranch, Maximize2, Minus, Plus, Sigma } from 'lucide-react'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { AnalysisModelPane, SelectedMeasure } from './cube-analysis-pane'
import { createCubeModelingI18n, CubeModelingI18n } from './cube-modeling-i18n'
import { createCubeWorkbenchI18n } from './cube-workbench-i18n'
import { cubeReadiness, measureRows } from './cube-workbench-model'
import { CubeReadinessPopover } from './cube-readiness-panel'
import { MeasureValidationStrip } from './cube-validation'
import { ERDiagram, ERDiagramHandle } from './er-diagram'
import {
	buildGraph,
	fieldSelectionId,
	replaceSelectionValue,
	selectionNodeId,
	selectionValue,
	StudioField,
	StudioNode,
	StudioSelection
} from './er-diagram-model'
import { FieldPropertyInspector } from './field-property-inspector'
import { createRelationshipI18n } from './relationship-i18n'
import { appendItem, objectCollection, replaceAt, replaceCollection, setObjectValue, StudioIssue } from './schema-utils'
import { useMediaQuery } from './studio-layout'
import { WorkspaceDetail } from './studio-types'

type ModelingLayer = 'structure' | 'mapping' | 'analysis'

export function CubeModelingStudio(props: {
	workspace: WorkspaceDetail
	schema: JsonObject
	tables: string[]
	issues: StudioIssue[]
	locale?: string
	generatingMeasures?: boolean
	onChange(schema: JsonObject): void
	onGenerateMeasures(cubeIndex: number): void
}) {
	const i18n = React.useMemo(() => createCubeModelingI18n(props.locale), [props.locale])
	const cubeI18n = React.useMemo(() => createCubeWorkbenchI18n(props.locale), [props.locale])
	const relationshipI18n = React.useMemo(() => createRelationshipI18n(props.locale), [props.locale])
	const cubes = objectCollection(props.schema, 'cubes')
	const [selectedCubeIndex, setSelectedCubeIndex] = React.useState(0)
	const [layer, setLayer] = React.useState<ModelingLayer>('mapping')
	const [selection, setSelection] = React.useState<StudioSelection | null>(() =>
		cubes.length ? { kind: 'cube', index: 0 } : null
	)
	const [selectedMeasure, setSelectedMeasure] = React.useState<SelectedMeasure | null>(null)
	const [measureSearch, setMeasureSearch] = React.useState('')
	const [graphZoom, setGraphZoom] = React.useState(1)
	const diagramRef = React.useRef<ERDiagramHandle>(null)
	const wideMapping = useMediaQuery('(min-width: 1180px)')
	const { nodes, edges } = React.useMemo(() => buildGraph(props.schema), [props.schema])

	React.useEffect(() => {
		setSelectedCubeIndex((index) => Math.max(0, Math.min(index, Math.max(0, cubes.length - 1))))
	}, [cubes.length])

	const cube = cubes[selectedCubeIndex]
	const rows = React.useMemo(() => (cube ? measureRows(cube) : []), [cube])

	React.useEffect(() => {
		if (!cube || !rows.length) {
			setSelectedMeasure(null)
			return
		}
		if (
			selectedMeasure &&
			rows.some((row) => row.kind === selectedMeasure.kind && row.index === selectedMeasure.index)
		) {
			return
		}
		const defaultMeasure = readString(cube, 'defaultMeasure')
		const preferred = rows.find((row) => row.name === defaultMeasure) ?? rows[0]
		setSelectedMeasure({ kind: preferred.kind, index: preferred.index })
	}, [cube, rows, selectedMeasure])

	React.useEffect(() => {
		if (!selection && nodes[0]) {
			setSelection({ kind: nodes[0].kind, index: nodes[0].index })
			return
		}
		if (selection && !nodes.some((node) => node.id === selectionNodeId(selection))) {
			const fallback = nodes.find((node) => node.kind === 'cube' && node.index === selectedCubeIndex) ?? nodes[0]
			setSelection(fallback ? { kind: fallback.kind, index: fallback.index } : null)
		}
	}, [nodes, selectedCubeIndex, selection])

	const selectedField =
		selection?.kind === 'field'
			? nodes
					.find((node) => node.kind === selection.nodeKind && node.index === selection.nodeIndex)
					?.fields.find((field) => field.id === fieldSelectionId(selection))
			: undefined
	const selectedObject = selectionValue(props.schema, selection)
	const activeMeasure =
		selectedMeasure && cube
			? selectedMeasure.kind === 'physical'
				? objectCollection(cube, 'measures')[selectedMeasure.index]
				: objectCollection(cube, 'calculatedMembers')[selectedMeasure.index]
			: undefined

	const cubeName = cube
		? (readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${selectedCubeIndex + 1}`)
		: ''
	const entityName = cubeName || props.workspace.model.name || ''
	const cubeDisplayName = i18n.t('cubeDisplayName', { name: cubeName })
	const entityDisplayName = i18n.t('entityName', { name: entityName })
	const dimensions = cube
		? [...objectCollection(cube, 'dimensionUsages'), ...objectCollection(cube, 'dimensions')]
		: []
	const readiness = cube ? cubeReadiness(cube, rows) : 0
	const validCount = rows.filter((row) => row.valid).length
	const warningCount = rows.length - validCount

	function updateCubes(nextCubes: JsonObject[]) {
		props.onChange(replaceCollection(props.schema, 'cubes', nextCubes))
	}

	function updateCube(nextCube: JsonObject) {
		updateCubes(replaceAt(cubes, selectedCubeIndex, nextCube))
	}

	function addCube() {
		const nextIndex = cubes.length
		updateCubes(
			appendItem(cubes, {
				name: `Cube ${nextIndex + 1}`,
				caption: `Cube ${nextIndex + 1}`,
				fact: { type: 'table' },
				dimensionUsages: [],
				dimensions: [],
				measures: [],
				calculatedMembers: [],
				calculations: [],
				parameters: []
			})
		)
		setSelectedCubeIndex(nextIndex)
		setSelectedMeasure(null)
		setSelection({ kind: 'cube', index: nextIndex })
		setLayer('analysis')
	}

	function addMeasure() {
		if (!cube) {
			return
		}
		const measures = objectCollection(cube, 'measures')
		updateCube(
			replaceCollection(
				cube,
				'measures',
				appendItem(measures, {
					name: `Measure ${measures.length + 1}`,
					column: '',
					aggregator: 'sum',
					datatype: 'Numeric',
					visible: true
				})
			)
		)
		const nextSelection = { kind: 'physical' as const, index: measures.length }
		setSelectedMeasure(nextSelection)
		setSelection({
			kind: 'field',
			nodeKind: 'cube',
			nodeIndex: selectedCubeIndex,
			fieldKind: 'measure',
			fieldIndex: measures.length
		})
	}

	function selectNode(node: StudioNode) {
		setSelection({ kind: node.kind, index: node.index })
		if (node.kind === 'cube') {
			setSelectedCubeIndex(node.index)
		}
	}

	function selectField(field: StudioField) {
		setSelection(field.selection)
		if (field.selection.nodeKind === 'cube') {
			setSelectedCubeIndex(field.selection.nodeIndex)
			if (field.selection.fieldKind === 'measure') {
				setSelectedMeasure({ kind: 'physical', index: field.selection.fieldIndex })
			}
		}
		if (layer === 'mapping' && !wideMapping) {
			setLayer('structure')
		}
	}

	function updateSelectedField(key: string, value: JsonValue | undefined) {
		if (!selection || !selectedObject) {
			return
		}
		props.onChange(replaceSelectionValue(props.schema, selection, setObjectValue(selectedObject, key, value)))
	}

	if (!cube) {
		return (
			<div className="grid h-full min-h-[420px] place-items-center bg-background p-8">
				<div className="max-w-sm text-center">
					<div className="mx-auto grid size-10 place-items-center rounded-lg border bg-card">
						<Box className="size-5 text-muted-foreground" aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-base font-semibold">{i18n.t('cube')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{i18n.t('noCubes')}</p>
					<Button className="mt-4" size="sm" onClick={addCube}>
						<Plus aria-hidden="true" />
						{i18n.t('addCube')}
					</Button>
				</div>
			</div>
		)
	}

	const validationFooter = (
		<MeasureValidationStrip
			rows={rows}
			validCount={validCount}
			warningCount={warningCount}
			i18n={cubeI18n}
			onOpen={() => setLayer('analysis')}
			onFix={(row) => {
				setLayer('analysis')
				setSelectedMeasure({ kind: row.kind, index: row.index })
			}}
		/>
	)

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
			<header className="flex min-h-[66px] shrink-0 items-center gap-4 border-b bg-card/75 px-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5 text-sm font-semibold">
						<span>{i18n.t('cube')}</span>
						<span className="text-muted-foreground">/</span>
						<span className="truncate">{cubeDisplayName}</span>
					</div>
					<div className="mt-1 truncate text-[11px] text-muted-foreground">
						{i18n.t('statusSummary', {
							cube: cubeDisplayName,
							entity: entityDisplayName,
							dimensions: dimensions.length,
							measures: rows.length
						})}
					</div>
				</div>

				<ModelingLayerTabs layer={layer} i18n={i18n} onChange={setLayer} />

				<div className="flex min-w-0 flex-1 items-center justify-end gap-2">
					<div className="flex items-center gap-1.5 text-[11px] text-success max-[980px]:hidden">
						<CheckCircle2 className="size-3.5" aria-hidden="true" />
						<span className="truncate">{i18n.t('structureAndMappingReady')}</span>
					</div>
					<CubeReadinessPopover
						schema={props.schema}
						issues={props.issues}
						readiness={readiness}
						i18n={cubeI18n}
					/>
				</div>
			</header>

			<div className="relative min-h-0 flex-1">
				{layer === 'mapping' && !wideMapping ? (
					<CompactMappingOverview
						entityName={entityDisplayName}
						cubeName={cubeDisplayName}
						dimensionCount={dimensions.length}
						measureCount={rows.length}
						i18n={i18n}
						onOpenStructure={() => setLayer('structure')}
						onOpenAnalysis={() => setLayer('analysis')}
					/>
				) : null}

				{layer === 'mapping' && wideMapping ? (
					<>
						<div className="h-full min-h-0 p-3">
							<ResizablePanelGroup
								id="semantic-cube-modeling-mapping"
								orientation="horizontal"
								className="h-full min-h-0"
							>
								<ResizablePanel id="semantic-cube-modeling-structure" defaultSize="42%" minSize="34%">
									<div className="h-full min-h-0 overflow-hidden rounded-lg border">
										<DataStructurePane
											compact
											nodes={nodes}
											edges={edges}
											selection={selection}
											selectedField={selectedField}
											selectedObject={selectedObject}
											sourceTables={props.tables}
											graphZoom={graphZoom}
											diagramRef={diagramRef}
											i18n={i18n}
											relationshipI18n={relationshipI18n}
											onSelectNode={selectNode}
											onSelectField={selectField}
											onClearSelection={() => setSelection(null)}
											onUpdateField={updateSelectedField}
											onZoomChange={setGraphZoom}
											onFocus={() => setLayer('structure')}
										/>
									</div>
								</ResizablePanel>
								<ResizableHandle
									id="semantic-cube-modeling-mapping-resize"
									withHandle
									className="z-20 w-3 bg-transparent hover:bg-ring/15 data-[resize-handle-active]:bg-ring/20"
								/>
								<ResizablePanel id="semantic-cube-modeling-analysis" defaultSize="58%" minSize="46%">
									<div className="h-full min-h-0 overflow-hidden rounded-lg border">
										<AnalysisModelPane
											cubes={cubes}
											cube={cube}
											cubeIndex={selectedCubeIndex}
											rows={rows}
											activeMeasure={activeMeasure}
											selectedMeasure={selectedMeasure}
											search={measureSearch}
											generatingMeasures={props.generatingMeasures}
											footer={validationFooter}
											i18n={i18n}
											onSelectCube={(index) => {
												setSelectedCubeIndex(index)
												setSelection({ kind: 'cube', index })
												setSelectedMeasure(null)
											}}
											onSelectDimension={(name) => {
												const node = nodes.find(
													(item) => item.kind === 'dimension' && item.name === name
												)
												if (node) {
													selectNode(node)
												}
											}}
											onSearch={setMeasureSearch}
											onSelectMeasure={(value) => {
												setSelectedMeasure(value)
												if (value.kind === 'physical') {
													setSelection({
														kind: 'field',
														nodeKind: 'cube',
														nodeIndex: selectedCubeIndex,
														fieldKind: 'measure',
														fieldIndex: value.index
													})
												}
											}}
											onAddMeasure={addMeasure}
											onGenerateMeasures={() => props.onGenerateMeasures(selectedCubeIndex)}
											onChange={updateCube}
										/>
									</div>
								</ResizablePanel>
							</ResizablePanelGroup>
						</div>
						<div className="pointer-events-none absolute left-[42%] top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
							<MappingBridge entityName={entityDisplayName} cubeName={cubeDisplayName} i18n={i18n} />
						</div>
					</>
				) : null}

				{layer === 'structure' ? (
					<DataStructurePane
						nodes={nodes}
						edges={edges}
						selection={selection}
						selectedField={selectedField}
						selectedObject={selectedObject}
						sourceTables={props.tables}
						graphZoom={graphZoom}
						diagramRef={diagramRef}
						i18n={i18n}
						relationshipI18n={relationshipI18n}
						onSelectNode={selectNode}
						onSelectField={selectField}
						onClearSelection={() => setSelection(null)}
						onUpdateField={updateSelectedField}
						onZoomChange={setGraphZoom}
						onFocus={() => setLayer('mapping')}
					/>
				) : null}

				{layer === 'analysis' ? (
					<div className="mx-auto h-full max-w-[1260px]">
						<AnalysisModelPane
							cubes={cubes}
							cube={cube}
							cubeIndex={selectedCubeIndex}
							rows={rows}
							activeMeasure={activeMeasure}
							selectedMeasure={selectedMeasure}
							search={measureSearch}
							generatingMeasures={props.generatingMeasures}
							footer={validationFooter}
							i18n={i18n}
							onSelectCube={(index) => {
								setSelectedCubeIndex(index)
								setSelection({ kind: 'cube', index })
								setSelectedMeasure(null)
							}}
							onSelectDimension={(name) => {
								const node = nodes.find((item) => item.kind === 'dimension' && item.name === name)
								if (node) {
									selectNode(node)
								}
							}}
							onSearch={setMeasureSearch}
							onSelectMeasure={setSelectedMeasure}
							onAddMeasure={addMeasure}
							onGenerateMeasures={() => props.onGenerateMeasures(selectedCubeIndex)}
							onChange={updateCube}
						/>
					</div>
				) : null}
			</div>
		</div>
	)
}

function ModelingLayerTabs(props: {
	layer: ModelingLayer
	i18n: CubeModelingI18n
	onChange(layer: ModelingLayer): void
}) {
	const items: Array<{ key: ModelingLayer; label: string }> = [
		{ key: 'structure', label: props.i18n.t('dataStructure') },
		{ key: 'mapping', label: props.i18n.t('mapping') },
		{ key: 'analysis', label: props.i18n.t('analysisModel') }
	]
	return (
		<nav
			className="flex shrink-0 rounded-lg border bg-muted/35 p-0.5 max-[760px]:hidden"
			aria-label={props.i18n.t('mappingDescription')}
		>
			{items.map((item) => (
				<Button
					key={item.key}
					variant="ghost"
					size="xs"
					className={cn(
						'min-w-20 px-3 text-xs',
						props.layer === item.key && 'bg-background text-foreground shadow-xs hover:bg-background'
					)}
					aria-current={props.layer === item.key ? 'page' : undefined}
					onClick={() => props.onChange(item.key)}
				>
					{item.label}
				</Button>
			))}
		</nav>
	)
}

function MappingBridge(props: { entityName: string; cubeName: string; i18n: CubeModelingI18n }) {
	return (
		<div className="flex items-center gap-1.5 rounded-full border bg-background/95 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
			<ArrowLeftRight className="size-3 text-primary" aria-hidden="true" />
			{props.i18n.t('mappingBridge', {
				entity: props.entityName,
				cube: props.cubeName
			})}
		</div>
	)
}

function CompactMappingOverview(props: {
	entityName: string
	cubeName: string
	dimensionCount: number
	measureCount: number
	i18n: CubeModelingI18n
	onOpenStructure(): void
	onOpenAnalysis(): void
}) {
	return (
		<div className="grid h-full place-items-center overflow-auto p-5">
			<div className="w-full max-w-2xl">
				<div className="text-center">
					<h2 className="text-sm font-semibold">{props.i18n.t('mapping')}</h2>
					<p className="mt-1 text-xs text-muted-foreground">{props.i18n.t('mappingDescription')}</p>
				</div>
				<div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
					<button
						type="button"
						className="rounded-lg border bg-card p-4 text-left shadow-xs hover:border-primary/40 hover:bg-muted/20"
						onClick={props.onOpenStructure}
					>
						<GitBranch className="size-4 text-primary" aria-hidden="true" />
						<div className="mt-3 text-sm font-semibold">{props.entityName}</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{props.dimensionCount} {props.i18n.t('dimensionList')}
						</div>
					</button>
					<ArrowLeftRight className="mx-auto size-4 text-primary" aria-hidden="true" />
					<button
						type="button"
						className="rounded-lg border bg-card p-4 text-left shadow-xs hover:border-primary/40 hover:bg-muted/20"
						onClick={props.onOpenAnalysis}
					>
						<Sigma className="size-4 text-primary" aria-hidden="true" />
						<div className="mt-3 text-sm font-semibold">{props.cubeName}</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{props.measureCount} {props.i18n.t('allMeasures')}
						</div>
					</button>
				</div>
			</div>
		</div>
	)
}

function DataStructurePane(props: {
	compact?: boolean
	nodes: StudioNode[]
	edges: ReturnType<typeof buildGraph>['edges']
	selection: StudioSelection | null
	selectedField?: StudioField
	selectedObject?: JsonObject
	sourceTables: string[]
	graphZoom: number
	diagramRef: React.RefObject<ERDiagramHandle>
	i18n: CubeModelingI18n
	relationshipI18n: ReturnType<typeof createRelationshipI18n>
	onSelectNode(node: StudioNode): void
	onSelectField(field: StudioField): void
	onClearSelection(): void
	onUpdateField(key: string, value: JsonValue | undefined): void
	onZoomChange(zoom: number): void
	onFocus(): void
}) {
	React.useEffect(() => {
		const frame = requestAnimationFrame(() => props.diagramRef.current?.fit())
		return () => cancelAnimationFrame(frame)
	}, [props.compact, props.diagramRef, props.nodes.length])

	const inspector =
		!props.compact && props.selectedField && props.selectedObject ? (
			<aside className="min-h-0 border-l bg-card/50">
				<FieldPropertyInspector
					field={props.selectedField}
					value={props.selectedObject}
					sourceTables={props.sourceTables}
					i18n={props.relationshipI18n}
					onUpdate={props.onUpdateField}
				/>
			</aside>
		) : null
	return (
		<section className="flex h-full min-h-0 min-w-0 flex-col bg-background" data-testid="cube-data-structure">
			<div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
				<div className="min-w-0 flex-1">
					<h2 className="text-xs font-semibold">{props.i18n.t('dataStructure')}</h2>
					<p className="truncate text-[10px] text-muted-foreground">{props.i18n.t('mappingDescription')}</p>
				</div>
				<Button variant="outline" size="xs" onClick={props.onFocus}>
					<GitBranch aria-hidden="true" />
					{props.i18n.t('editRelationships')}
				</Button>
			</div>
			<div className={cn('h-full min-h-0 flex-1', inspector && 'grid grid-cols-[minmax(0,1fr)_300px]')}>
				<div className="relative h-full min-h-0 min-w-0">
					<ERDiagram
						ref={props.diagramRef}
						nodes={props.nodes}
						edges={props.edges}
						selection={props.selection}
						emphasizeSelection={!props.compact}
						i18n={props.relationshipI18n}
						onSelectNode={props.onSelectNode}
						onSelectField={props.onSelectField}
						onClearSelection={props.onClearSelection}
						onZoomChange={props.onZoomChange}
					/>
					<div className="absolute bottom-3 right-3 flex items-center rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
						<DiagramButton
							label={props.i18n.t('zoomOut')}
							onClick={() => props.diagramRef.current?.zoomBy(0.9)}
						>
							<Minus aria-hidden="true" />
						</DiagramButton>
						<span className="min-w-12 text-center text-[10px] tabular-nums text-muted-foreground">
							{Math.round(props.graphZoom * 100)}%
						</span>
						<DiagramButton
							label={props.i18n.t('zoomIn')}
							onClick={() => props.diagramRef.current?.zoomBy(1.1)}
						>
							<Plus aria-hidden="true" />
						</DiagramButton>
						<DiagramButton
							label={props.i18n.t('fitDiagram')}
							onClick={() => props.diagramRef.current?.fit()}
						>
							<Focus aria-hidden="true" />
						</DiagramButton>
						<DiagramButton
							label={props.i18n.t('autoLayout')}
							onClick={() => props.diagramRef.current?.autoLayout()}
						>
							<Maximize2 aria-hidden="true" />
						</DiagramButton>
					</div>
				</div>
				{inspector}
			</div>
		</section>
	)
}

function DiagramButton(props: { label: string; children: React.ReactNode; onClick(): void }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="icon-xs" aria-label={props.label} onClick={props.onClick}>
					{props.children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{props.label}</TooltipContent>
		</Tooltip>
	)
}
