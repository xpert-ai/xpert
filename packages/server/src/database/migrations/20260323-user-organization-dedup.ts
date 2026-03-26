import { MigrationInterface, QueryRunner } from 'typeorm'

async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
	if (queryRunner.connection.options.type === 'postgres') {
		const rows = await queryRunner.query(`SELECT to_regclass($1) AS "regclass"`, [tableName])
		return Boolean(rows?.[0]?.regclass)
	}

	const table = await queryRunner.getTable(tableName)
	return Boolean(table)
}

export class UserOrganizationDedup_20260323 implements MigrationInterface {
	name = 'UserOrganizationDedup_20260323'

	public async up(queryRunner: QueryRunner): Promise<void> {
		const exists = await tableExists(queryRunner, 'user_organization')
		if (!exists) {
			return
		}

		if (queryRunner.connection.options.type === 'postgres') {
			await queryRunner.query(`
				WITH duplicate_rows AS (
					SELECT ctid
					FROM (
						SELECT
							ctid,
							ROW_NUMBER() OVER (
								PARTITION BY "tenantId", "organizationId", "userId"
								ORDER BY "createdAt" ASC NULLS LAST, "updatedAt" ASC NULLS LAST, "id" ASC
							) AS row_number
						FROM "user_organization"
						WHERE "tenantId" IS NOT NULL
							AND "organizationId" IS NOT NULL
							AND "userId" IS NOT NULL
					) ranked
					WHERE ranked.row_number > 1
				)
				DELETE FROM "user_organization"
				WHERE ctid IN (SELECT ctid FROM duplicate_rows)
			`)
			return
		}

		await queryRunner.query(`
			DELETE FROM "user_organization"
			WHERE "id" NOT IN (
				SELECT MIN("id")
				FROM "user_organization"
				WHERE "tenantId" IS NOT NULL
					AND "organizationId" IS NOT NULL
					AND "userId" IS NOT NULL
				GROUP BY "tenantId", "organizationId", "userId"
			)
			AND "tenantId" IS NOT NULL
			AND "organizationId" IS NOT NULL
			AND "userId" IS NOT NULL
		`)
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// Data cleanup is intentionally irreversible.
	}
}
