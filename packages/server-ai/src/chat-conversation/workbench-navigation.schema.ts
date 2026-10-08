import { z } from 'zod/v3'

export const navigationThreadSchema = z.string().trim().min(1).max(100).optional()
export const navigationMessageSchema = z.string().uuid().optional()
