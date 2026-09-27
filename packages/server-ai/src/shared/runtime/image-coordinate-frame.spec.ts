import { fullImageFrame, imageCoordinateFrameSchema, imagePointToSource } from './image-coordinate-frame'

describe('Image coordinate frames', () => {
    it('maps normalized endpoints and preserves non-square geometry', () => {
        const frame = fullImageFrame(1280, 800)
        expect(imagePointToSource({ x: 999, y: 999 }, frame, { kind: 'normalized', maximum: 999 })).toEqual({
            x: 1279,
            y: 799
        })
        expect(imagePointToSource({ x: 200, y: 475 }, frame, { kind: 'normalized', maximum: 999 })).toEqual({
            x: 256,
            y: 380
        })
        expect(imagePointToSource({ x: 200, y: 475 }, frame, { kind: 'pixels' })).toEqual({ x: 200, y: 475 })
    })
    it('maps an enlarged crop into the original source without accumulated transforms', () => {
        const frame = imageCoordinateFrameSchema.parse({
            sourceWidth: 1280,
            sourceHeight: 800,
            imageWidth: 600,
            imageHeight: 400,
            region: { left: 100, top: 300, width: 300, height: 200 }
        })
        expect(imagePointToSource({ x: 999, y: 999 }, frame, { kind: 'normalized', maximum: 999 })).toEqual({
            x: 399,
            y: 499
        })
        expect(imagePointToSource({ x: 0, y: 0 }, frame, { kind: 'pixels' })).toEqual({ x: 100, y: 300 })
        expect(imagePointToSource({ x: 599, y: 399 }, frame, { kind: 'pixels' })).toEqual({ x: 399, y: 499 })
    })
    it('rejects invalid regions, fractional input and coordinate overflow', () => {
        const frame = fullImageFrame(1280, 800)
        expect(
            imageCoordinateFrameSchema.safeParse({ ...frame, region: { left: 1280, top: 0, width: 1, height: 1 } })
                .success
        ).toBe(false)
        for (const x of [-1, 0.5, 1000, NaN, Infinity]) {
            expect(() => imagePointToSource({ x, y: 0 }, frame, { kind: 'normalized', maximum: 999 })).toThrow()
        }
        expect(() => imagePointToSource({ x: 1, y: 800 }, frame, { kind: 'pixels' })).toThrow()
        expect(imagePointToSource({ x: 0, y: 0 }, fullImageFrame(1, 1), { kind: 'pixels' })).toEqual({ x: 0, y: 0 })
    })
    it('maps letterboxed canvas content and rejects padding without clipping it to a source edge', () => {
        const frame = imageCoordinateFrameSchema.parse({
            sourceWidth: 1280,
            sourceHeight: 800,
            imageWidth: 1000,
            imageHeight: 1000,
            region: { left: 0, top: 0, width: 1280, height: 800 },
            content: { left: 0, top: 187, width: 1000, height: 625 }
        })
        for (const system of [{ kind: 'pixels' as const }, { kind: 'normalized' as const, maximum: 999 as const }]) {
            expect(imagePointToSource({ x: 0, y: 187 }, frame, system)).toEqual({ x: 0, y: 0 })
            expect(imagePointToSource({ x: 999, y: 811 }, frame, system)).toEqual({ x: 1279, y: 799 })
            expect(imagePointToSource({ x: 500, y: 499 }, frame, system)).toEqual({ x: 640, y: 400 })
            expect(() => imagePointToSource({ x: 500, y: 186 }, frame, system)).toThrow('padding')
        }
        expect(
            imageCoordinateFrameSchema.safeParse({ ...frame, content: { left: 0, top: 900, width: 1000, height: 625 } })
                .success
        ).toBe(false)
    })
})
