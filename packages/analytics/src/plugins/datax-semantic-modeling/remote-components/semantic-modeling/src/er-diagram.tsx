import * as React from 'react'
import { Hash, KeyRound, Sigma, Table2 } from 'lucide-react'
import { Badge, cn } from '@xpert-ai/shadcn-ui'
import {
	fieldSelectionId,
	selectionNodeId,
	StudioEdge,
	StudioField,
	StudioNode,
	StudioSelection
} from './er-diagram-model'
import { DiagramPoint as Point, DiagramSize, resizeDiagramViewport, zoomDiagramViewport } from './er-diagram-viewport'
import { RelationshipI18n } from './relationship-i18n'

export type { StudioEdge, StudioField, StudioNode, StudioSelection } from './er-diagram-model'

const NODE_WIDTH = 264
const NODE_HEIGHT = 244
const NODE_GAP_X = 116
const NODE_GAP_Y = 72
const CANVAS_PADDING = 36

export type ERDiagramHandle = {
	autoLayout(): void
	fit(): void
	zoomBy(factor: number): void
}

type DragState =
	| {
			kind: 'node'
			nodeId: string
			pointerStart: Point
			positionStart: Point
	  }
	| {
			kind: 'canvas'
			pointerStart: Point
			panStart: Point
	  }

export const ERDiagram = React.forwardRef<
	ERDiagramHandle,
	{
		nodes: StudioNode[]
		edges: StudioEdge[]
		selection: StudioSelection | null
		emphasizeSelection?: boolean
		i18n: RelationshipI18n
		onSelectNode(node: StudioNode): void
		onSelectField(field: StudioField): void
		onClearSelection(): void
		onZoomChange(zoom: number): void
	}
>(function ERDiagram(props, forwardedRef) {
	const containerRef = React.useRef<HTMLDivElement | null>(null)
	const nodesRef = React.useRef(props.nodes)
	const panRef = React.useRef<Point>({ x: CANVAS_PADDING, y: CANVAS_PADDING })
	const zoomRef = React.useRef(1)
	const dragRef = React.useRef<DragState | null>(null)
	const [positions, setPositions] = React.useState<Record<string, Point>>(() => calculateAutoLayout(props.nodes))
	const positionsRef = React.useRef(positions)
	const [pan, setPan] = React.useState<Point>(panRef.current)
	const [zoom, setZoom] = React.useState(zoomRef.current)
	const [dragging, setDragging] = React.useState(false)
	const [containerSize, setContainerSize] = React.useState<DiagramSize>({ width: 0, height: 0 })
	const nodeIdentity = props.nodes.map((node) => node.id).join('|')
	const layoutIdentityRef = React.useRef(nodeIdentity)
	const previousContainerSizeRef = React.useRef<DiagramSize | null>(null)
	const markerId = React.useId().replaceAll(':', '')
	nodesRef.current = props.nodes

	const commitPositions = React.useCallback((next: Record<string, Point>) => {
		positionsRef.current = next
		setPositions(next)
	}, [])

	const commitPan = React.useCallback((next: Point) => {
		panRef.current = next
		setPan(next)
	}, [])

	const commitZoom = React.useCallback(
		(next: number) => {
			zoomRef.current = next
			setZoom(next)
			props.onZoomChange(next)
		},
		[props.onZoomChange]
	)

	const fitDiagram = React.useCallback(
		(nextPositions: Record<string, Point> = positionsRef.current) => {
			const container = containerRef.current
			const currentNodes = nodesRef.current
			if (!container || !currentNodes.length) {
				return
			}
			const bounds = diagramBounds(currentNodes, nextPositions)
			const availableWidth = Math.max(1, container.clientWidth - CANVAS_PADDING * 2)
			const availableHeight = Math.max(1, container.clientHeight - CANVAS_PADDING * 2)
			const nextZoom = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), 0.32, 1.15)
			commitZoom(nextZoom)
			commitPan({
				x: (container.clientWidth - bounds.width * nextZoom) / 2 - bounds.x * nextZoom,
				y: (container.clientHeight - bounds.height * nextZoom) / 2 - bounds.y * nextZoom
			})
		},
		[commitPan, commitZoom]
	)

	const autoLayout = React.useCallback(() => {
		const next = calculateAutoLayout(nodesRef.current)
		commitPositions(next)
		requestAnimationFrame(() => fitDiagram(next))
	}, [commitPositions, fitDiagram])

	const zoomBy = React.useCallback(
		(factor: number) => {
			const container = containerRef.current
			if (!container) {
				return
			}
			const previousZoom = zoomRef.current
			const center = { x: container.clientWidth / 2, y: container.clientHeight / 2 }
			const next = zoomDiagramViewport({ pan: panRef.current, zoom: previousZoom }, factor, center)
			commitZoom(next.zoom)
			commitPan(next.pan)
		},
		[commitPan, commitZoom]
	)

	React.useImperativeHandle(
		forwardedRef,
		() => ({
			autoLayout,
			fit: () => fitDiagram(),
			zoomBy
		}),
		[autoLayout, fitDiagram, zoomBy]
	)

	React.useEffect(() => {
		if (layoutIdentityRef.current === nodeIdentity) {
			return
		}
		layoutIdentityRef.current = nodeIdentity
		const next = calculateAutoLayout(nodesRef.current)
		commitPositions(next)
		requestAnimationFrame(() => fitDiagram(next))
	}, [commitPositions, fitDiagram, nodeIdentity])

	React.useEffect(() => {
		const container = containerRef.current
		if (!container || typeof ResizeObserver === 'undefined') {
			return
		}
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) {
				return
			}
			const nextSize = {
				width: entry.contentRect.width,
				height: entry.contentRect.height
			}
			setContainerSize((current) =>
				current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
			)
		})
		observer.observe(container)
		return () => observer.disconnect()
	}, [])

	React.useEffect(() => {
		if (!containerSize.width || !containerSize.height) {
			return
		}
		const previousSize = previousContainerSizeRef.current
		previousContainerSizeRef.current = containerSize
		if (!previousSize) {
			fitDiagram()
			return
		}
		if (previousSize.width === containerSize.width && previousSize.height === containerSize.height) {
			return
		}
		const next = resizeDiagramViewport({ pan: panRef.current, zoom: zoomRef.current }, previousSize, containerSize)
		commitPan(next.pan)
	}, [commitPan, containerSize, fitDiagram])

	React.useEffect(() => {
		const handlePointerMove = (event: PointerEvent) => {
			const drag = dragRef.current
			if (!drag) {
				return
			}
			if (drag.kind === 'canvas') {
				commitPan({
					x: drag.panStart.x + event.clientX - drag.pointerStart.x,
					y: drag.panStart.y + event.clientY - drag.pointerStart.y
				})
				return
			}
			const next = {
				...positionsRef.current,
				[drag.nodeId]: {
					x: drag.positionStart.x + (event.clientX - drag.pointerStart.x) / zoomRef.current,
					y: drag.positionStart.y + (event.clientY - drag.pointerStart.y) / zoomRef.current
				}
			}
			commitPositions(next)
		}
		const handlePointerUp = () => {
			dragRef.current = null
			setDragging(false)
		}
		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', handlePointerUp)
		window.addEventListener('pointercancel', handlePointerUp)
		return () => {
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', handlePointerUp)
			window.removeEventListener('pointercancel', handlePointerUp)
		}
	}, [commitPan, commitPositions])

	const selectedNodeId = selectionNodeId(props.selection)
	const selectedFieldId = props.selection?.kind === 'field' ? fieldSelectionId(props.selection) : null
	const worldSize = diagramBounds(props.nodes, positions)

	return (
		<div
			ref={containerRef}
			data-testid="semantic-er-diagram"
			data-zoom={zoom}
			data-pan-x={pan.x}
			data-pan-y={pan.y}
			className={cn(
				'relative h-full min-h-[260px] w-full overflow-hidden bg-muted/10',
				dragging ? 'cursor-grabbing select-none' : 'cursor-grab'
			)}
			aria-label={props.i18n.t('diagramLabel')}
			onPointerDown={(event) => {
				const target = event.target
				if (target instanceof Element && target.closest('[data-er-node]')) {
					return
				}
				dragRef.current = {
					kind: 'canvas',
					pointerStart: { x: event.clientX, y: event.clientY },
					panStart: panRef.current
				}
				setDragging(true)
				props.onClearSelection()
			}}
			onWheel={(event) => {
				const target = event.target
				if (target instanceof Element && target.closest('[data-er-fields]')) {
					return
				}
				event.preventDefault()
				zoomBy(event.deltaY > 0 ? 0.9 : 1.1)
			}}
		>
			<div
				className="absolute left-0 top-0 origin-top-left"
				style={{
					width: Math.max(worldSize.x + worldSize.width + CANVAS_PADDING, containerSize.width),
					height: Math.max(worldSize.y + worldSize.height + CANVAS_PADDING, containerSize.height),
					transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
				}}
			>
				<svg
					className="pointer-events-none absolute inset-0 overflow-visible"
					width="100%"
					height="100%"
					aria-hidden="true"
				>
					<defs>
						<marker
							id={markerId}
							viewBox="0 0 8 8"
							refX="7"
							refY="4"
							markerWidth="7"
							markerHeight="7"
							orient="auto-start-reverse"
						>
							<path d="M 0 0 L 8 4 L 0 8 z" className="fill-border" />
						</marker>
					</defs>
					{props.edges.map((edge) => {
						const geometry = edgeGeometry(edge, positions)
						if (!geometry) {
							return null
						}
						const related = selectedNodeId === edge.source || selectedNodeId === edge.target
						const emphasizeSelection = props.emphasizeSelection !== false
						return (
							<g key={edge.id}>
								<path
									d={geometry.path}
									fill="none"
									markerEnd={`url(#${markerId})`}
									className={cn(
										'stroke-border transition-opacity',
										emphasizeSelection && selectedNodeId && !related
											? 'opacity-20'
											: related
												? 'stroke-primary opacity-70'
												: 'opacity-70'
									)}
									strokeWidth={related ? 1.8 : 1.2}
								/>
								{edge.label ? (
									<text
										x={geometry.label.x}
										y={geometry.label.y}
										textAnchor="middle"
										className={cn(
											'fill-muted-foreground text-[10px]',
											emphasizeSelection && selectedNodeId && !related && 'opacity-20'
										)}
									>
										{edge.label}
									</text>
								) : null}
							</g>
						)
					})}
				</svg>

				{props.nodes.map((node) => {
					const position = positions[node.id] ?? { x: 0, y: 0 }
					const nodeSelected = selectedNodeId === node.id
					return (
						<section
							key={node.id}
							data-er-node={node.id}
							data-testid={`er-node-${node.id}`}
							className={cn(
								'absolute flex h-[244px] w-[264px] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow,opacity]',
								node.kind === 'cube' && 'border-primary/45',
								nodeSelected && 'border-primary ring-2 ring-primary/20',
								props.emphasizeSelection !== false && selectedNodeId && !nodeSelected && 'opacity-45'
							)}
							style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
							onClick={() => props.onSelectNode(node)}
						>
							<header
								className={cn(
									'flex h-[62px] shrink-0 cursor-move items-center gap-3 border-b px-3',
									node.kind === 'cube' ? 'bg-primary/8' : 'bg-muted/30'
								)}
								onPointerDown={(event) => {
									event.preventDefault()
									event.stopPropagation()
									dragRef.current = {
										kind: 'node',
										nodeId: node.id,
										pointerStart: { x: event.clientX, y: event.clientY },
										positionStart: position
									}
									setDragging(true)
								}}
							>
								<span
									className={cn(
										'grid size-8 shrink-0 place-items-center rounded-md border bg-background',
										node.kind === 'cube' && 'text-primary'
									)}
								>
									<Table2 className="size-4" aria-hidden="true" />
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold">{node.name}</div>
									<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
										<span className="shrink-0 font-medium uppercase tracking-wide">
											{node.kind === 'cube' ? props.i18n.t('fact') : props.i18n.t('dimension')}
										</span>
										<span aria-hidden="true">·</span>
										<span className="truncate font-mono">{node.subtitle}</span>
									</div>
								</div>
								<Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
									{node.fields.length}
								</Badge>
							</header>
							<div data-er-fields className="min-h-0 flex-1 overflow-y-auto py-1">
								{node.fields.map((field, fieldIndex) => {
									const selected = selectedFieldId === field.id
									return (
										<button
											key={field.id}
											type="button"
											data-testid={`er-field-${field.id}`}
											className={cn(
												'group flex h-8 w-full items-center gap-2 border-l-2 border-transparent px-3 text-left text-[11px] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
												selected && 'border-primary bg-primary/10 text-primary'
											)}
											onClick={(event) => {
												event.stopPropagation()
												props.onSelectField(field)
											}}
										>
											{field.kind === 'measure' ? (
												<Sigma className="size-3.5 shrink-0" aria-hidden="true" />
											) : fieldIndex === 0 ? (
												<KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
											) : (
												<Hash className="size-3.5 shrink-0" aria-hidden="true" />
											)}
											<span className="min-w-0 flex-1 truncate font-medium">{field.name}</span>
											<span className="max-w-[88px] truncate font-mono text-[9px] text-muted-foreground">
												{field.column || field.dataType}
											</span>
										</button>
									)
								})}
								{!node.fields.length ? (
									<div className="grid h-20 place-items-center text-[10px] text-muted-foreground">
										{props.i18n.t('emptyFields')}
									</div>
								) : null}
							</div>
						</section>
					)
				})}
			</div>
		</div>
	)
})

function calculateAutoLayout(nodes: StudioNode[]): Record<string, Point> {
	const cubes = nodes.filter((node) => node.kind === 'cube')
	const dimensions = nodes.filter((node) => node.kind === 'dimension')
	const positions: Record<string, Point> = {}
	if (cubes.length === 1 && dimensions.length) {
		const sideRows = Math.ceil(dimensions.length / 2)
		const centerY = Math.max(0, ((sideRows - 1) * (NODE_HEIGHT + NODE_GAP_Y)) / 2)
		positions[cubes[0].id] = { x: NODE_WIDTH + NODE_GAP_X, y: centerY }
		dimensions.forEach((node, index) => {
			const side = index % 2
			const row = Math.floor(index / 2)
			positions[node.id] = {
				x: side === 0 ? 0 : (NODE_WIDTH + NODE_GAP_X) * 2,
				y: row * (NODE_HEIGHT + NODE_GAP_Y)
			}
		})
		return positions
	}
	const ordered = [...cubes, ...dimensions]
	const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))
	ordered.forEach((node, index) => {
		positions[node.id] = {
			x: (index % columns) * (NODE_WIDTH + NODE_GAP_X),
			y: Math.floor(index / columns) * (NODE_HEIGHT + NODE_GAP_Y)
		}
	})
	return positions
}

function diagramBounds(nodes: StudioNode[], positions: Record<string, Point>) {
	if (!nodes.length) {
		return { x: 0, y: 0, width: 1, height: 1 }
	}
	const points = nodes.map((node) => positions[node.id] ?? { x: 0, y: 0 })
	const minX = Math.min(...points.map((point) => point.x))
	const minY = Math.min(...points.map((point) => point.y))
	const maxX = Math.max(...points.map((point) => point.x + NODE_WIDTH))
	const maxY = Math.max(...points.map((point) => point.y + NODE_HEIGHT))
	return {
		x: minX,
		y: minY,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY)
	}
}

function edgeGeometry(edge: StudioEdge, positions: Record<string, Point>) {
	const source = positions[edge.source]
	const target = positions[edge.target]
	if (!source || !target) {
		return null
	}
	const sourceOnLeft = source.x < target.x
	const start = {
		x: source.x + (sourceOnLeft ? NODE_WIDTH : 0),
		y: source.y + NODE_HEIGHT / 2
	}
	const end = {
		x: target.x + (sourceOnLeft ? 0 : NODE_WIDTH),
		y: target.y + NODE_HEIGHT / 2
	}
	const controlOffset = Math.max(60, Math.abs(end.x - start.x) * 0.42)
	const control1 = {
		x: start.x + (sourceOnLeft ? controlOffset : -controlOffset),
		y: start.y
	}
	const control2 = {
		x: end.x + (sourceOnLeft ? -controlOffset : controlOffset),
		y: end.y
	}
	return {
		path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
		label: {
			x: (start.x + end.x) / 2,
			y: (start.y + end.y) / 2 - 7
		}
	}
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, value))
}
