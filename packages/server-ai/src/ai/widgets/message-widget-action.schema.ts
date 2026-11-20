import { z } from 'zod/v3'

export const widgetActionFields = z.record(z.unknown())

const storedWidget = z.object({
    id: z.string(),
    type: z.literal('component'),
    data: z.object({
        type: z.literal('Widget'),
        widgets: z.array(z.object({ serverActions: z.array(z.string()).optional() }))
    })
})

export function messageOffersWidgetAction(content: unknown, widgetId: string, action: string): boolean {
    if (!Array.isArray(content)) return false
    return content.some((part) => {
        if (part?.id !== widgetId) return false
        const widget = storedWidget.safeParse(part)
        return widget.success && widget.data.data.widgets.some((surface) => surface.serverActions?.includes(action))
    })
}
