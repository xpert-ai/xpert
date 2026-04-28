import { buildHeatmapLegend } from './clawxpert-heatmap.utils'

describe('ClawXpertOverviewComponent', () => {
  it('builds unique heatmap legend keys while preserving repeated success colors', () => {
    const legend = buildHeatmapLegend()

    expect(new Set(legend.map((cell) => cell.key)).size).toBe(legend.length)
    expect(legend.filter((cell) => cell.background === 'var(--color-state-success-solid)')).toHaveLength(3)
  })
})
