import { DataSource } from 'typeorm'
import { USAGE_POINTS_PREDICATE, USAGE_POINTS_SQL } from './membership-usage-points'

// Read-only PostgreSQL fixtures: no real tables, schema changes or billing writes.
const url = process.env.XPERT_USAGE_READ_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('consumption points / PostgreSQL read projection', () => {
    let database: DataSource
    beforeAll(async () => {
        database = await new DataSource({
            type: 'postgres',
            url,
            extra: { options: '-c default_transaction_read_only=on' }
        }).initialize()
    })
    afterAll(async () => database?.destroy())

    type Entry = {
        id: string
        tenantId: string
        userId: string
        source: string
        pointsDelta?: number
        excessPoints?: number
        sourceReference?: string
        gatewayRequestId?: string
        pricingStatus?: string
        settlementCurrency?: string
        settlementAmount?: number
    }
    const fact = (id: string, overrides: Partial<Entry> = {}): Entry => ({
        id,
        tenantId: 'tenant',
        userId: 'user',
        source: 'model_usage',
        pointsDelta: 0,
        pricingStatus: 'priced',
        settlementCurrency: 'CNY',
        settlementAmount: 0.125,
        ...overrides
    })
    const debit = (id: string, overrides: Partial<Entry> = {}): Entry => ({
        id,
        tenantId: 'tenant',
        userId: 'user',
        source: 'usage',
        pointsDelta: -1,
        ...overrides
    })
    async function consumption(entries: Entry[], rate = 0.1) {
        const rows: { id: string; points: string | null }[] = await database.query(
            `
            WITH membership_point_ledger AS (
                SELECT * FROM jsonb_to_recordset($1::jsonb) AS fixture(
                    id text, "tenantId" text, "userId" text, source text,
                    "pointsDelta" numeric, "excessPoints" numeric, "sourceReference" text, "gatewayRequestId" text,
                    "pricingStatus" text, "settlementCurrency" text, "settlementAmount" numeric
                )
            )
            SELECT ledger.id, ${USAGE_POINTS_SQL.replace(/:usageCnyPerPoint/g, '$2::numeric')} AS points
            FROM membership_point_ledger ledger
            WHERE ledger."tenantId" = $3 AND ledger."userId" = $4 AND ${USAGE_POINTS_PREDICATE.replace(/:tenantId/g, '$3').replace(/:userId/g, '$4')}
            ORDER BY ledger.id`,
            [JSON.stringify(entries), rate, 'tenant', 'user']
        )
        return rows.map((row) => ({ id: row.id, points: row.points === null ? null : Number(row.points) }))
    }

    it('counts unlimited/direct consumption without any debit, including historical facts', async () => {
        expect(await consumption([fact('direct')])).toEqual([{ id: 'direct', points: 1.25 }])
        expect(await consumption([fact('direct')], 0.25)).toEqual([{ id: 'direct', points: 0.5 }])
    })

    it('keeps small nonzero consumption instead of rounding it down to zero', async () => {
        expect(await consumption([fact('small', { settlementAmount: 0.0000001 })])).toEqual([
            { id: 'small', points: 0.000001 }
        ])
    })

    it('counts split settlement once and preserves historical multipliers/rates and excess usage', async () => {
        expect(
            await consumption(
                [
                    fact('paid'),
                    debit('plan', { sourceReference: 'model-usage-charge:paid', pointsDelta: -2, excessPoints: 0.5 }),
                    debit('personal', {
                        source: 'personal_usage',
                        sourceReference: 'model-usage-charge:paid:personal',
                        pointsDelta: -1
                    })
                ],
                0.25
            )
        ).toEqual([{ id: 'paid', points: 3.5 }])
    })

    it('retains standalone legacy and external API settlements alongside modern facts', async () => {
        expect(await consumption([fact('direct'), debit('legacy'), debit('gateway', { pointsDelta: -3 })])).toEqual([
            { id: 'direct', points: 1.25 },
            { id: 'gateway', points: 3 },
            { id: 'legacy', points: 1 }
        ])
    })

    it('does not double count retained external API facts and their settlements', async () => {
        expect(
            await consumption([
                fact('retained', { gatewayRequestId: 'gateway-call' }),
                debit('gateway', { gatewayRequestId: 'gateway-call', pointsDelta: -4 })
            ])
        ).toEqual([{ id: 'retained', points: 4 }])
    })

    it('distinguishes known free use from unknown prices and missing currency conversion', async () => {
        expect(
            await consumption([
                fact('free', { pricingStatus: 'free', settlementAmount: undefined }),
                fact('unpriced', { pricingStatus: 'unpriced' }),
                fact('currency', { settlementCurrency: 'USD' }),
                fact('missing', { settlementAmount: undefined })
            ])
        ).toEqual([
            { id: 'currency', points: null },
            { id: 'free', points: 0 },
            { id: 'missing', points: null },
            { id: 'unpriced', points: null }
        ])
    })

    it('does not read another tenant/user or let their debits change this user’s points', async () => {
        expect(
            await consumption([
                fact('mine'),
                fact('other-user', { userId: 'other' }),
                fact('other-tenant', { tenantId: 'other' }),
                debit('foreign', { userId: 'other', pointsDelta: -100, sourceReference: 'model-usage-charge:mine' })
            ])
        ).toEqual([{ id: 'mine', points: 1.25 }])
    })

    it('preserves a settled zero multiplier instead of falling back to model cost', async () => {
        expect(
            await consumption([
                fact('discounted'),
                debit('zero', {
                    pointsDelta: 0,
                    sourceReference: 'model-usage-charge:discounted'
                })
            ])
        ).toEqual([{ id: 'discounted', points: 0 }])
    })
})
