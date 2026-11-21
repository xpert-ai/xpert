/** PostgreSQL numeric columns and persisted SSE events may contain decimal strings.
 * A missing/invalid duration must not discard an otherwise valid terminal event. */
export function executionDuration(value: unknown): number | undefined {
    const duration =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
              ? Number(value)
              : undefined
    return duration !== undefined && Number.isFinite(duration) && duration >= 0 ? duration : undefined
}
