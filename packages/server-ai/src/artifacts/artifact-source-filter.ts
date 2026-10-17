/**
 * Persistence detail: escape LIKE metacharacters before appending the prefix wildcard.
 * Assumes backslash is the database's LIKE escape character; verify this when changing storage drivers or settings.
 */
export function artifactResourcePrefixPattern(prefix: string): string {
    return `${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}
