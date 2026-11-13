import { z } from 'zod/v3'

const id = z.string().uuid()
const name = z.string().min(1).max(500)
export const cliReceiptSchema = z.object({ environmentId: id, instanceId: name, receiptId: name }).strict().nullable()

export const computerCliConnectionSchema = z
    .object({ mode: z.enum(['platform', 'native']), revision: z.number().int().nonnegative() })
    .strict()
export const computerCliConnectionPreferenceSchema = computerCliConnectionSchema.extend({
    mode: z.enum(['auto', 'platform', 'native'])
})
