export type ClawXpertHeatmapStyle = {
  background: string
  borderColor: string
  opacity: number
}

export type ClawXpertHeatmapLegendCell = ClawXpertHeatmapStyle & {
  key: string
}

const HEATMAP_LEGEND_LEVELS = [0, 0.35, 0.65, 1]

export function buildHeatmapLegend(): ClawXpertHeatmapLegendCell[] {
  return HEATMAP_LEGEND_LEVELS.map((level, index) => ({
    key: `${index}-${level}`,
    ...buildHeatmapStyles(level, false)
  }))
}

export function buildHeatmapStyles(level: number, isFuture: boolean): ClawXpertHeatmapStyle {
  if (isFuture) {
    return {
      background: 'var(--color-components-toggle-bg-unchecked)',
      borderColor: 'var(--color-components-toggle-bg-unchecked)',
      opacity: 0.24
    }
  }

  if (level <= 0) {
    return {
      background: 'var(--color-components-toggle-bg-unchecked)',
      borderColor: 'var(--color-divider-regular)',
      opacity: 0.14
    }
  }

  return {
    background: 'var(--color-state-success-solid)',
    borderColor: 'var(--color-state-success-solid)',
    opacity: Math.min(1, Math.max(0.24, Number((0.24 + level * 0.76).toFixed(3))))
  }
}
