import { z } from 'zod'
import { graphSchema, nodeSchema } from './bridge'

const responseSchema = z.object({
    item: graphSchema,
    avatars: z.record(z.string(), nodeSchema.shape.assigneeAvatar).optional(),
    avatarRefs: z.record(z.string(), z.string()).optional()
})

export class GraphAvatarCache {
    private avatars = new Map<string, z.infer<typeof nodeSchema.shape.assigneeAvatar>>()
    query() {
        return { parameters: { compactAvatars: true, avatarVersions: [...this.avatars.keys()].slice(0, 128) } }
    }
    read(response: unknown) {
        const { item, avatars, avatarRefs } = responseSchema.parse(response)
        const next = new Map<string, z.infer<typeof nodeSchema.shape.assigneeAvatar>>()
        const tasks = item.tasks.map((task) => {
            const version = avatarRefs?.[task.id]
            if (!version) return task
            const avatar = avatars?.[version] ?? this.avatars.get(version)
            if (!avatar) throw new Error('Missing task avatar; refresh to retry.')
            next.set(version, avatar)
            return { ...task, assigneeAvatar: avatar }
        })
        this.avatars = next
        return { ...item, tasks }
    }
}
