import { DataSource, EntitySchema } from 'typeorm'
import { mergeConversationOptionsSql } from './conversation-options-sql'

class QueryDataSource extends DataSource {
    prepare() {
        return this.buildMetadatas()
    }
}

describe('conversation options SQL', () => {
    it('keeps prompt property names, quotes, backslashes and Unicode intact through TypeORM', async () => {
        const schema = new EntitySchema({
            name: 'ConversationOptionsTest',
            columns: {
                id: { type: String, primary: true },
                taskId: { type: String },
                options: { type: 'json' }
            }
        })
        const source = new QueryDataSource({ type: 'postgres', entities: [schema] })
        await source.prepare()
        const json = JSON.stringify({ parameters: { input: "/bid-technical-basis taskId=abc '报价' \\ 文件\n下一行" } })
        const [sql, parameters] = source
            .createQueryBuilder()
            .update(schema)
            .set({ options: () => mergeConversationOptionsSql(json) })
            .where('id = :id', { id: 'one' })
            .getQueryAndParameters()
        const hex = sql.match(/decode\('([0-9a-f]+)', 'hex'\)/)?.[1]
        expect(hex).toBeDefined()
        expect(Buffer.from(hex!, 'hex').toString('utf8')).toBe(json)
        expect(parameters).toEqual(['one'])
        expect(sql).toContain('COALESCE("options"::jsonb')
        expect(sql).not.toContain('/bid-technical-basis')
    })
})
