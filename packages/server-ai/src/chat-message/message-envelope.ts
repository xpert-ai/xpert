import { Raw } from 'typeorm'

/** Same policy as chatMessagePresentation; apply before pagination and recursive turn counting. */
export function visibleChatMessageSql(envelope: string): string {
    return `(${envelope} IS NULL
        OR (${envelope})::jsonb = 'null'::jsonb
        OR ((${envelope})::jsonb -> 'version' = '1'::jsonb
            AND (${envelope})::jsonb ->> 'presentation' IN ('message', 'event')))`
}

export const visibleChatMessage = () => Raw(visibleChatMessageSql)
