import { z } from 'zod/v3'

export const bosiCapabilitySchema = z.enum(['cloud-computer', 'desktop-shell'])
export const bosiSelectionSchema = z
    .object({
        capabilities: z.array(bosiCapabilitySchema).max(2).default([]),
        modelId: z.string().trim().min(1).max(1000)
    })
    .strict()
export type BosiSelection = z.output<typeof bosiSelectionSchema>
export const bosiSetupQuerySchema = z
    .object({
        capabilities: z
            .string()
            .max(64)
            .optional()
            .transform((value) => (value ? value.split(',') : []))
            .pipe(z.array(bosiCapabilitySchema).max(2))
    })
    .strict()
export type BosiSetupQuery = z.output<typeof bosiSetupQuerySchema>
/** Server-only durable checkpoint; retain existing JSON keys so interrupted installations can resume. */
export const bosiProgressSchema = z
    .object({
        version: z.literal(1),
        phase: z.enum(['installing', 'welcome_pending', 'welcome_running', 'ready', 'welcome_failed']),
        capabilities: z.array(bosiCapabilitySchema).max(2),
        modelId: z.string(),
        // Imported Assistant reference, before or after publication.
        draftId: z.string().optional(),
        threadId: z.string(),
        // Stable clientMessageId of the welcome input, used to deduplicate retries.
        welcomeMessageId: z.string(),
        // Latest welcome execution; replaced on retry without recreating the Assistant.
        welcomeRunId: z.string().optional()
    })
    .strict()
export type BosiBootstrapProgress = z.output<typeof bosiProgressSchema>
