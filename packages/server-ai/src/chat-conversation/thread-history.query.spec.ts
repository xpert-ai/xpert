import { Client } from 'pg'
import { READ_THREAD_PATH_SQL } from './thread-history.query'

// Run against a disposable PostgreSQL database, never the platform's application database.
const integration = process.env.THREAD_REFERENCE_TEST_DATABASE_URL ? describe : describe.skip
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

integration('thread ancestry pagination in PostgreSQL', () => {
    const client = new Client({ connectionString: process.env.THREAD_REFERENCE_TEST_DATABASE_URL })
    beforeAll(async () => {
        await client.connect()
        await client.query(`CREATE TEMP TABLE chat_message (
            id uuid PRIMARY KEY, "parentId" uuid, "conversationId" uuid,
            role text, "followUpStatus" text, "deletedAt" timestamptz
        )`)
        // Two branches share the first turn. A different conversation and queued input must not leak.
        const rows = [
            [1, null, 100, 'human', null],
            [2, 1, 100, 'ai', null],
            [3, 2, 100, 'human', null],
            [4, 3, 100, 'ai', null],
            [5, 2, 100, 'human', null],
            [6, 5, 100, 'ai', null],
            [7, 6, 100, 'human', 'pending'],
            [8, null, 200, 'human', null]
        ]
        for (const [messageId, parentId, conversationId, role, followUp] of rows) {
            await client.query('INSERT INTO chat_message VALUES ($1, $2, $3, $4, $5, NULL)', [
                id(Number(messageId)),
                parentId ? id(Number(parentId)) : null,
                id(Number(conversationId)),
                role,
                followUp
            ])
        }
    })
    afterAll(async () => client.end())

    it('reads exact branches and resumes from the next parent without duplicates', async () => {
        const newest = await client.query<{ id: string; parentId: string | null }>(READ_THREAD_PATH_SQL, [
            id(6),
            id(100),
            500,
            1
        ])
        expect(newest.rows.map((row) => row.id)).toEqual([id(6), id(5)])
        const older = await client.query<{ id: string }>(READ_THREAD_PATH_SQL, [
            newest.rows.at(-1)?.parentId,
            id(100),
            500,
            1
        ])
        expect(older.rows.map((row) => row.id)).toEqual([id(2), id(1)])
        const otherBranch = await client.query<{ id: string }>(READ_THREAD_PATH_SQL, [id(4), id(100), 500, 2])
        expect(otherBranch.rows.map((row) => row.id)).toEqual([id(4), id(3), id(2), id(1)])
    })

    it('does not treat pending input as a turn boundary and bounds rows even within a long turn', async () => {
        const pending = await client.query<{ id: string }>(READ_THREAD_PATH_SQL, [id(7), id(100), 500, 1])
        expect(pending.rows.map((row) => row.id)).toEqual([id(7), id(6), id(5)])
        const bounded = await client.query<{ id: string }>(READ_THREAD_PATH_SQL, [id(7), id(100), 2, 10])
        expect(bounded.rows.map((row) => row.id)).toEqual([id(7), id(6)])
        const crossConversation = await client.query(READ_THREAD_PATH_SQL, [id(8), id(100), 500, 10])
        expect(crossConversation.rows).toEqual([])
    })

    it('bounds a thousand-message turn and resumes with no gaps', async () => {
        await client.query(
            `INSERT INTO chat_message
            SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
                CASE WHEN n = 1000 THEN NULL ELSE ('00000000-0000-4000-8000-' || lpad((n - 1)::text, 12, '0'))::uuid END,
                $1, CASE WHEN n = 1000 THEN 'human' ELSE 'ai' END, NULL, NULL
            FROM generate_series(1000, 2000) n`,
            [id(300)]
        )
        const seen: string[] = []
        let next: string | null = id(2000)
        while (next) {
            const page = await client.query<{ id: string; parentId: string | null }>(READ_THREAD_PATH_SQL, [
                next,
                id(300),
                500,
                1
            ])
            expect(page.rows.length).toBeLessThanOrEqual(500)
            seen.push(...page.rows.map((row) => row.id))
            next = page.rows.at(-1)?.parentId ?? null
        }
        expect(seen).toHaveLength(1001)
        expect(new Set(seen).size).toBe(1001)
        expect(seen[0]).toBe(id(2000))
        expect(seen.at(-1)).toBe(id(1000))
    })
})
