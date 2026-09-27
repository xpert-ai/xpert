// Coordinates are relative to the supplied image, never a host window or viewport.
import { z } from 'zod/v3'

const dimension = z.number().int().min(1).max(16384)
const offset = z.number().int().min(0).max(16383)
const rectangle = z.object({ left: offset, top: offset, width: dimension, height: dimension }).strict()
export const imageCoordinateFrameSchema = z
    .object({
        sourceWidth: dimension,
        sourceHeight: dimension,
        imageWidth: dimension,
        imageHeight: dimension,
        region: rectangle,
        content: rectangle.optional()
    })
    .strict()
    .refine(
        (frame) =>
            frame.region.left + frame.region.width <= frame.sourceWidth &&
            frame.region.top + frame.region.height <= frame.sourceHeight &&
            (!frame.content ||
                (frame.content.left + frame.content.width <= frame.imageWidth &&
                    frame.content.top + frame.content.height <= frame.imageHeight)),
        'Image region exceeds the source or canvas'
    )
export type ImageCoordinateFrame = z.infer<typeof imageCoordinateFrameSchema>
export type ImageCoordinateSystem = { kind: 'pixels' } | { kind: 'normalized'; maximum: 999 | 1000 }
export type ImagePoint = { x: number; y: number }

export function fullImageFrame(width: number, height: number): ImageCoordinateFrame {
    return imageCoordinateFrameSchema.parse({
        sourceWidth: width,
        sourceHeight: height,
        imageWidth: width,
        imageHeight: height,
        region: { left: 0, top: 0, width, height }
    })
}

export function imagePointToSource(
    point: ImagePoint,
    frame: ImageCoordinateFrame,
    system: ImageCoordinateSystem
): ImagePoint {
    const content = frame.content ?? { left: 0, top: 0, width: frame.imageWidth, height: frame.imageHeight }
    const convert = (
        value: number,
        imageSize: number,
        contentSize: number,
        contentOrigin: number,
        sourceSize: number,
        origin: number
    ) => {
        const maximum = system.kind === 'normalized' ? system.maximum : imageSize - 1
        if (!Number.isInteger(value) || value < 0 || value > maximum)
            throw new RangeError('Image coordinate outside its frame')
        const pixel = maximum === 0 ? 0 : (value * (imageSize - 1)) / maximum
        if (pixel < contentOrigin || pixel > contentOrigin + contentSize - 1)
            throw new RangeError('Image coordinate falls in canvas padding')
        return (
            origin +
            (contentSize === 1 ? 0 : Math.round(((pixel - contentOrigin) * (sourceSize - 1)) / (contentSize - 1)))
        )
    }
    return {
        x: convert(point.x, frame.imageWidth, content.width, content.left, frame.region.width, frame.region.left),
        y: convert(point.y, frame.imageHeight, content.height, content.top, frame.region.height, frame.region.top)
    }
}
