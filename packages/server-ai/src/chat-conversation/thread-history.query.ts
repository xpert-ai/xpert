/**
 * IDs only: walk newest-to-oldest ancestors until the row or submitted-human-turn limit.
 * Parameters: starting message, source conversation, scan limit, turn limit.
 * Deleted/queued messages keep the chain connected but do not count as turn boundaries.
 * The reader separately loads non-deleted content for the returned IDs.
 */
export const READ_THREAD_PATH_SQL = `
            WITH RECURSIVE path AS (
                SELECT m.id, m."parentId", 1 AS depth,
                    CASE WHEN m.role = 'human' AND (m."followUpStatus" IS NULL OR m."followUpStatus" = 'consumed')
                        AND m."deletedAt" IS NULL THEN 1 ELSE 0 END AS humans
                FROM chat_message m WHERE m.id = $1 AND m."conversationId" = $2
                UNION ALL
                SELECT m.id, m."parentId", p.depth + 1,
                    p.humans + CASE WHEN m.role = 'human' AND (m."followUpStatus" IS NULL OR m."followUpStatus" = 'consumed')
                        AND m."deletedAt" IS NULL THEN 1 ELSE 0 END
                FROM chat_message m JOIN path p ON m.id = p."parentId"
                WHERE m."conversationId" = $2 AND p.depth < $3 AND p.humans < $4
            ) SELECT id, "parentId" FROM path ORDER BY depth ASC
        `
