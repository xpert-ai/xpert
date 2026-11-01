import { fitTrailBounds, revealTrailPoint } from './trail-camera'

describe('trail camera fit', () => {
    it('centers a sparse tree by its rendered extent and caps magnification', () => {
        const bounds = { x: 36, y: 46, width: 260, height: 126 }
        const camera = fitTrailBounds(bounds, 1400, 850)
        expect(camera.x + (bounds.x + bounds.width / 2) * camera.scale).toBe(700)
        expect(camera.y + (bounds.y + bounds.height / 2) * camera.scale).toBe(425)
        expect(camera.scale).toBe(1.5)
    })
    it.each([
        { x: -20, y: 25, width: 5000, height: 350 },
        { x: 36, y: -90, width: 800, height: 1800 }
    ])('keeps wide or tall content including labels inside viewport padding', (bounds) => {
        const camera = fitTrailBounds(bounds, 900, 600)
        const left = camera.x + bounds.x * camera.scale
        const top = camera.y + bounds.y * camera.scale
        const right = left + bounds.width * camera.scale
        const bottom = top + bounds.height * camera.scale
        expect(left).toBeGreaterThanOrEqual(32)
        expect(top).toBeGreaterThanOrEqual(32)
        expect(right).toBeLessThanOrEqual(868)
        expect(bottom).toBeLessThanOrEqual(568)
        expect((left + right) / 2).toBeCloseTo(450)
        expect((top + bottom) / 2).toBeCloseTo(300)
    })
    it('keeps the content center stable while zooming', () => {
        const bounds = { x: 36, y: 46, width: 400, height: 200 }
        const fitted = fitTrailBounds(bounds, 1000, 600)
        const zoomed = fitTrailBounds(bounds, 1000, 600, 2)
        expect(zoomed.scale).toBe(fitted.scale * 2)
        expect(zoomed.x + 236 * zoomed.scale).toBe(500)
        expect(zoomed.y + 146 * zoomed.scale).toBe(300)
    })
    it('handles a hidden or narrow viewport without invalid transforms', () => {
        const bounds = { x: 36, y: 46, width: 260, height: 126 }
        expect(fitTrailBounds(bounds, 0, 0)).toEqual({ x: 0, y: 0, scale: 0 })
        const camera = fitTrailBounds(bounds, 100, 60)
        expect(camera.scale).toBeGreaterThan(0)
        expect(camera.x + 166 * camera.scale).toBeCloseTo(50)
        expect(camera.y + 109 * camera.scale).toBeCloseTo(30)
    })
})

describe('trail camera selection', () => {
    it('leaves an already visible leaf and its viewport unchanged', () => {
        expect(revealTrailPoint({ x: 300, y: 240 }, 800, 600)).toEqual({ x: 0, y: 0 })
    })
    it('pans an obscured leaf into the canvas beside the floating inspector', () => {
        expect(revealTrailPoint({ x: 900, y: 240 }, 760, 600)).toEqual({ x: -520, y: 0 })
    })
    it('reveals both axes without changing scale', () => {
        expect(revealTrailPoint({ x: -20, y: 800 }, 1000, 600)).toEqual({ x: 520, y: -500 })
    })
    it('does not move the tree when a narrow overlay covers the usable canvas', () => {
        expect(revealTrailPoint({ x: 400, y: 200 }, 30, 600)).toEqual({ x: 0, y: 0 })
    })
})
