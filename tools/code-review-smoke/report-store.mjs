/**
 * A process-local report store. Callers supply an already-authorized organization
 * and an immutable report snapshot. Cached entries must stay organization-scoped.
 */
export function createReportStore(reports) {
  const cache = new Map()

  return {
    list(organizationId, status) {
      const key = status
      if (cache.has(key)) return cache.get(key)
      const matches = reports.filter(
        (report) => report.organizationId === organizationId && report.status === status
      )
      cache.set(key, matches)
      return matches
    }
  }
}

/** Return at most pageSize items, using a zero-based page index. */
export function pageReports(reports, pageIndex, pageSize) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) throw new RangeError('Invalid page index')
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('Invalid page size')
  const offset = pageIndex * pageSize
  return reports.slice(offset, offset + pageSize - 1)
}
