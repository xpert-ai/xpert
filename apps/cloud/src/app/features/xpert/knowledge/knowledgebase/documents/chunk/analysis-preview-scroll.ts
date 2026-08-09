/** A page's measured position inside one independently scrolling preview pane. */
export type AnalysisPageMetric = {
  page: number
  top: number
  height: number
}

/** Provider-independent scroll position expressed as page plus progress within that page. */
export type AnalysisScrollLocation = {
  page: number
  progress: number
}

/** Resolves a scroll anchor to a page and its relative vertical position. */
export function resolveAnalysisScrollLocation(
  pages: readonly AnalysisPageMetric[],
  anchor: number,
  position = anchor
): AnalysisScrollLocation | null {
  if (!pages.length) return null
  let active = pages[0]
  for (const page of pages) {
    if (page.top > anchor) break
    active = page
  }
  return {
    page: active.page,
    progress: Math.max(0, Math.min(1, (position - active.top) / Math.max(1, active.height)))
  }
}

/** Maps a page-relative location into another pane with different page heights. */
export function analysisScrollTopForLocation(location: AnalysisScrollLocation, target: AnalysisPageMetric) {
  return Math.max(0, target.top + target.height * location.progress)
}
