import { z } from 'zod/v3'
export const sharingUserIdsSchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }).strict()
export const sharingGroupsSchema = z
    .object({ groupIds: z.array(z.string().uuid()).max(100), revision: z.string().min(1).max(64) })
    .strict()
export const sharingSearchSchema = z
    .object({ search: z.string().trim().max(100).default(''), skip: z.coerce.number().int().min(0).default(0) })
    .strict()
export const sharingLegacyIdsSchema = z.array(z.string().uuid()).max(100)
export type SharingSearch = z.output<typeof sharingSearchSchema>
export type SharingUsersInput = z.output<typeof sharingUserIdsSchema>
export type SharingGroupsInput = z.output<typeof sharingGroupsSchema>
