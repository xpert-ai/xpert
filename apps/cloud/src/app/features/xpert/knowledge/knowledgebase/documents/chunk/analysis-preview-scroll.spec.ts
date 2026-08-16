import { analysisScrollTopForLocation, resolveAnalysisScrollLocation } from './analysis-preview-scroll'

describe('analysis preview synchronized scrolling', () => {
  const pages = [
    { page: 1, top: 0, height: 1000 },
    { page: 2, top: 1024, height: 1200 },
    { page: 3, top: 2248, height: 800 }
  ]

  it('resolves the page and relative progress at the pane anchor', () => {
    expect(resolveAnalysisScrollLocation(pages, 1624, 1324)).toEqual({ page: 2, progress: 0.25 })
  })

  it('clamps anchors before and after the measured page', () => {
    expect(resolveAnalysisScrollLocation(pages, -100)).toEqual({ page: 1, progress: 0 })
    expect(resolveAnalysisScrollLocation(pages, 5000)).toEqual({ page: 3, progress: 1 })
  })

  it('maps the same page progress to a pane with a different page height', () => {
    const top = analysisScrollTopForLocation({ page: 2, progress: 0.5 }, { page: 2, top: 700, height: 600 })
    expect(top).toBe(1000)
  })
})
