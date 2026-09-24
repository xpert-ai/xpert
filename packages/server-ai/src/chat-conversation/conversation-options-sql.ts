/** TypeORM rewrites property names even inside SQL string literals. Encode the
 * payload so prompts containing "taskId=..." remain data during atomic merging.
 * The CRUD update boundary accepts expressions but cannot bind extra parameters.
 */
export function mergeConversationOptionsSql(json: string): string {
    const hex = Buffer.from(json, 'utf8').toString('hex')
    return `COALESCE("options"::jsonb, '{}'::jsonb) || convert_from(decode('${hex}', 'hex'), 'UTF8')::jsonb`
}
