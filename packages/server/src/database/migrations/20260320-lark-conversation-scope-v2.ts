import { MigrationInterface, QueryRunner } from 'typeorm'

async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
	const rows = await queryRunner.query(`SELECT to_regclass($1) AS "regclass"`, [tableName])
	return Boolean(rows?.[0]?.regclass)
}

export class LarkConversationScopeV2_20260320 implements MigrationInterface {
	name = 'LarkConversationScopeV2_20260320'

	public async up(queryRunner: QueryRunner): Promise<void> {
		const exists = await tableExists(queryRunner, 'plugin_lark_conversation_binding')
		if (!exists) {
			return
		}

		await queryRunner.query(`
			ALTER TABLE "plugin_lark_conversation_binding"
				ADD COLUMN IF NOT EXISTS "integrationId" character varying(64),
				ADD COLUMN IF NOT EXISTS "principalKey" character varying(255),
				ADD COLUMN IF NOT EXISTS "scopeKey" character varying(255),
				ADD COLUMN IF NOT EXISTS "chatType" character varying(32),
				ADD COLUMN IF NOT EXISTS "chatId" character varying(128),
				ADD COLUMN IF NOT EXISTS "senderOpenId" character varying(128)
		`)

		await queryRunner.query(`
			DROP INDEX IF EXISTS "plugin_lark_conversation_binding_user_id_uq"
		`)

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "plugin_lark_conversation_binding_user_id_idx"
			ON "plugin_lark_conversation_binding" ("userId")
		`)

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "plugin_lark_conversation_binding_principal_key_idx"
			ON "plugin_lark_conversation_binding" ("principalKey")
		`)

		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "plugin_lark_conversation_binding_scope_key_xpert_uq"
			ON "plugin_lark_conversation_binding" ("scopeKey", "xpertId")
			WHERE "scopeKey" IS NOT NULL
		`)

		await queryRunner.query(`
			UPDATE "plugin_lark_conversation_binding"
			SET "senderOpenId" = SUBSTRING("conversationUserKey" FROM LENGTH('open_id:') + 1)
			WHERE "senderOpenId" IS NULL
				AND "conversationUserKey" LIKE 'open_id:%'
		`)

		await queryRunner.query(`
			UPDATE "plugin_lark_conversation_binding"
			SET "principalKey" = CONCAT('lark:v2:principal:', "integrationId", ':open_id:', "senderOpenId")
			WHERE "principalKey" IS NULL
				AND "integrationId" IS NOT NULL
				AND "senderOpenId" IS NOT NULL
		`)

		await queryRunner.query(`
			UPDATE "plugin_lark_conversation_binding"
			SET "scopeKey" = CASE
				WHEN "chatType" = 'group' AND "integrationId" IS NOT NULL AND "chatId" IS NOT NULL
					THEN CONCAT('lark:v2:scope:', "integrationId", ':group:', "chatId")
				WHEN "integrationId" IS NOT NULL AND "senderOpenId" IS NOT NULL
					THEN CONCAT('lark:v2:scope:', "integrationId", ':p2p:', "senderOpenId")
				ELSE "scopeKey"
			END
			WHERE "scopeKey" IS NULL
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const exists = await tableExists(queryRunner, 'plugin_lark_conversation_binding')
		if (!exists) {
			return
		}

		await queryRunner.query(`
			DROP INDEX IF EXISTS "plugin_lark_conversation_binding_scope_key_xpert_uq"
		`)

		await queryRunner.query(`
			DROP INDEX IF EXISTS "plugin_lark_conversation_binding_principal_key_idx"
		`)

		await queryRunner.query(`
			DROP INDEX IF EXISTS "plugin_lark_conversation_binding_user_id_idx"
		`)

		await queryRunner.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS "plugin_lark_conversation_binding_user_id_uq"
			ON "plugin_lark_conversation_binding" ("userId")
		`)

		await queryRunner.query(`
			ALTER TABLE "plugin_lark_conversation_binding"
				DROP COLUMN IF EXISTS "senderOpenId",
				DROP COLUMN IF EXISTS "chatId",
				DROP COLUMN IF EXISTS "chatType",
				DROP COLUMN IF EXISTS "scopeKey",
				DROP COLUMN IF EXISTS "principalKey",
				DROP COLUMN IF EXISTS "integrationId"
		`)
	}
}
