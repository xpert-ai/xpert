import { z } from 'zod/v3'

const text = z.string().min(1).max(2000)
export const evolutionSubmissionSchema = z
    .object({
        strategyId: text,
        sourceKind: z.enum(['learning_events', 'business_evidence', 'manual']),
        targetId: text,
        requestId: z.string().min(1).max(200),
        scope: z
            .object({
                type: z.enum(['tenant', 'organization', 'workspace', 'project']),
                key: text,
                dimensions: z.record(text).optional()
            })
            .strict(),
        baseline: z.object({ resourceId: text, version: text, hash: text }).strict(),
        evidence: z
            .array(
                z
                    .object({
                        kind: z.enum(['document', 'execution', 'feedback', 'evaluation', 'artifact']),
                        subjectKey: text,
                        uri: text,
                        version: text,
                        hash: text,
                        locator: z
                            .object({
                                sourceId: text.optional(),
                                fragmentId: text.optional(),
                                quoteHash: text.optional()
                            })
                            .strict()
                            .optional()
                    })
                    .strict()
            )
            .max(100),
        learningEventIds: z.array(text).max(100).optional(),
        candidateInput: z
            .record(z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.array(text).max(1000)]))
            .optional(),
        datasetSnapshotIds: z.record(text).optional()
    })
    .strict()
