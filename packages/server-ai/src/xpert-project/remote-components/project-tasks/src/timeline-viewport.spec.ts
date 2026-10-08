import {
    timelineAnchor,
    timelineScrollLeft,
    zoomTimelineWidth,
    MIN_TIMELINE_WIDTH,
    MAX_TIMELINE_WIDTH
} from './timeline-viewport'

describe('timeline zoom and navigation', () => {
    it.each([true, false])('keeps the observed time centered with pinned columns = %s', (pinned) => {
        const before = { start: 1000, end: 10000, width: 2400, columns: 620, viewport: 1000, pinned }
        const anchor = timelineAnchor(before, 900)
        const after = { ...before, width: zoomTimelineWidth(before.width, 'in') }
        expect(timelineAnchor(after, timelineScrollLeft(after, anchor)).time).toBeCloseTo(anchor.time)
    })
    it('preserves time when the granularity also changes the domain', () => {
        const before = { start: 1000, end: 10000, width: 2400, columns: 620, viewport: 1000, pinned: true }
        const anchor = timelineAnchor(before, 900)
        const after = { ...before, start: 0, end: 12000, width: 3000 }
        expect(timelineAnchor(after, timelineScrollLeft(after, anchor)).time).toBeCloseTo(anchor.time)
    })
    it('brings time into view when task columns initially fill a narrow panel', () => {
        const geometry = { start: 0, end: 10000, width: 600, columns: 620, viewport: 400, pinned: false }
        const anchor = timelineAnchor(geometry, 0)
        expect(anchor.time).toBe(0)
        expect(timelineScrollLeft(geometry, anchor)).toBe(420)
    })
    it('bounds zoom and scrolling without creating an unbounded canvas', () => {
        expect(zoomTimelineWidth(MIN_TIMELINE_WIDTH, 'out')).toBe(MIN_TIMELINE_WIDTH)
        expect(zoomTimelineWidth(MAX_TIMELINE_WIDTH, 'in')).toBe(MAX_TIMELINE_WIDTH)
        const geometry = { start: 0, end: 10, width: 600, columns: 620, viewport: 400, pinned: false }
        expect(timelineScrollLeft(geometry, { time: -10, screenX: 200 })).toBe(0)
        expect(timelineScrollLeft(geometry, { time: 100, screenX: 200 })).toBe(820)
    })
})
