import { z } from 'zod/v3'

/** Parse persisted JSON once at the TypeORM boundary, then use concrete contracts throughout services. */
export function executionJson<T>(schema: z.ZodType<T>) {
    return {
        to: (value: T) => (value === undefined ? undefined : schema.parse(value)),
        from: (value: unknown) => schema.parse(value)
    }
}
