import { z } from 'zod'

const key = z.string().min(1).max(200)
const projectPath = z
    .string()
    .min(1)
    .max(2000)
    .refine(
        (path) =>
            !path.includes('\\') &&
            !/[\u0000-\u001f]/u.test(path) &&
            path.split('/').every((part) => !!part && part !== '.' && part !== '..')
    )
export const contentProjectionSchema = z
    .object({
        revision: z.string().min(1).max(256),
        sections: z
            .array(
                z
                    .object({
                        anchor: z.object({ kind: key, id: z.string().min(1).max(1000) }).strict(),
                        text: z.string().max(100000)
                    })
                    .strict()
            )
            .max(1000)
    })
    .strict()
export const contentSnapshotSchema = z
    .object({
        offlineAccess: z.literal('project').optional(),
        presentation: z
            .object({
                kind: z.literal('artifact'),
                referenceId: z.string().uuid(),
                type: z
                    .object({
                        pluginName: key,
                        resourceType: key,
                        title: z
                            .object({ en_US: key, zh_Hans: key.optional(), zh_Hant: key.optional() })
                            .strict()
                            .optional()
                    })
                    .strict()
                    .optional()
            })
            .strict()
            .optional(),
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200),
        typeId: key,
        modelId: key,
        schemaVersion: key,
        editProtocol: z.object({ id: key, version: key }).strict(),
        revision: z.string().min(1).max(256),
        updatedAt: z.string().datetime(),
        deleted: z.boolean(),
        sourceSync: z
            .object({ status: z.enum(['synced', 'pending', 'failed']), revision: z.string().optional() })
            .strict()
            .optional(),
        preview: z
            .object({
                kind: z.literal('outline'),
                revision: z.string().min(1).max(256),
                lines: z.array(z.string().max(160)).max(6)
            })
            .strict()
            .optional(),
        containedPaths: z
            .array(z.object({ path: projectPath, recursive: z.boolean() }).strict())
            .max(1000)
            .optional(),
        source: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('file'), path: z.string().min(1).max(2000) }).strict(),
            z
                .object({
                    kind: z.literal('bundle'),
                    rootPath: z.string().min(1).max(2000),
                    entryPath: z.string().min(1).max(2000)
                })
                .strict(),
            z.object({ kind: z.literal('managed') }).strict(),
            z.object({ kind: z.literal('external'), connectionRef: key, externalResourceId: key }).strict()
        ]),
        defaultEditorKey: key,
        allowedActions: z.array(z.enum(['rename', 'move', 'trash', 'restore', 'duplicate'])).max(5)
    })
    .strict()
