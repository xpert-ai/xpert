export type DiagramPoint = {
	x: number
	y: number
}

export type DiagramSize = {
	width: number
	height: number
}

export type DiagramViewport = {
	pan: DiagramPoint
	zoom: number
}

export function zoomDiagramViewport(viewport: DiagramViewport, factor: number, anchor: DiagramPoint): DiagramViewport {
	const nextZoom = clamp(viewport.zoom * factor, 0.32, 2)
	const worldAnchor = {
		x: (anchor.x - viewport.pan.x) / viewport.zoom,
		y: (anchor.y - viewport.pan.y) / viewport.zoom
	}
	return {
		zoom: nextZoom,
		pan: {
			x: anchor.x - worldAnchor.x * nextZoom,
			y: anchor.y - worldAnchor.y * nextZoom
		}
	}
}

export function resizeDiagramViewport(
	viewport: DiagramViewport,
	previousSize: DiagramSize,
	nextSize: DiagramSize
): DiagramViewport {
	const worldCenter = {
		x: (previousSize.width / 2 - viewport.pan.x) / viewport.zoom,
		y: (previousSize.height / 2 - viewport.pan.y) / viewport.zoom
	}
	return {
		...viewport,
		pan: {
			x: nextSize.width / 2 - worldCenter.x * viewport.zoom,
			y: nextSize.height / 2 - worldCenter.y * viewport.zoom
		}
	}
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, value))
}
