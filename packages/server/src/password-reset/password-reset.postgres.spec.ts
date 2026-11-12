import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { DataSource, Entity, EntitySchema, PrimaryColumn, QueryRunner } from 'typeorm'
import type { Request } from 'express'
import { sign, verify } from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { Email } from '../email/email.entity'
import { EmailTemplate } from '../email-template/email-template.entity'
import { EmailService } from '../email/email.service'
import { AuthService } from '../auth/auth.service'
import { JwtStrategy } from '../auth/strategies/jwt.strategy'
import { WsJwtStrategy } from '../auth/strategies/ws-jwt.strategy'
import { User } from '../user/user.entity'
import { PasswordReset } from './password-reset.entity'
import { PasswordResetCreateHandler } from './commands/handlers/password-reset.create.handler'
import { PasswordResetGetHandler } from './commands/handlers/password-reset.get.handler'
import { PasswordResetApplyHandler } from './commands/handlers/password-reset.apply.handler'
import { PasswordResetCreateCommand, PasswordResetApplyCommand, PasswordResetGetCommand } from './commands'
import { PasswordResetService } from './password-reset.service'
import { resetTokenLifetimeMs, tokenDigest } from './reset-token'

jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('../user/user.entity', () => {
	const orm = jest.requireActual<typeof import('typeorm')>('typeorm')
	@orm.Entity('reset_user_fixture')
	class User {
		@orm.PrimaryColumn('uuid') id: string
		@orm.Column({ type: 'uuid', nullable: true }) tenantId: string
		@orm.Column('text') email: string
		@orm.DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt: Date
		@orm.Column('text') hash: string
		@orm.Column('boolean') emailVerified: boolean
	}
	return { User }
})
jest.mock('../email-template/email-template.entity', () => {
	const orm = jest.requireActual<typeof import('typeorm')>('typeorm')
	@orm.Entity('email_template')
	class EmailTemplate {
		@orm.PrimaryGeneratedColumn('uuid') id: string
		@orm.Column('text') name: string
		@orm.Column('text') languageCode: string
	}
	return { EmailTemplate }
})

@Entity()
class Tenant {
	@PrimaryColumn('uuid') id: string
}
@Entity()
class Organization {
	@PrimaryColumn('uuid') id: string
}
jest.mock('./password-reset.entity', () => ({ PasswordReset: class PasswordReset {} }))

const url = process.env.XPERT_RESET_TEST_DATABASE_URL
const postgres = url ? describe : describe.skip
const secret = 'reset-regression-test-signing-key'
const original = { id: randomUUID(), tenantId: randomUUID(), email: 'owner@example.invalid' }
const schema = 'reset_' + randomUUID().replace(/-/g, '')
const sql = (file: string) => readFileSync(join(__dirname, 'migrations', file), 'utf8')
const migration = '20261110000200-bound-reset-tickets.sql'
const legacyJwt = sign({ id: original.id, tenantId: original.tenantId, role: 'USER' }, secret, { expiresIn: '1h' })

const archivedJwt = sign({ id: original.id, tenantId: original.tenantId, iat: 2222 }, secret)

postgres('one-use reset tickets on PostgreSQL', () => {
	let db: DataSource
	let create: PasswordResetCreateHandler
	let apply: PasswordResetApplyHandler
	let get: PasswordResetGetHandler
	let auth: AuthService
	const issue = (account = original) =>
		create.execute(new PasswordResetCreateCommand({ ...account, userId: account.id }))
	const redeem = (token: string, password = 'replacement') =>
		auth.resetPassword({ token, password, confirmPassword: password })
	const row = (token: string) => db.manager.findOneBy(PasswordReset, { token: tokenDigest(token) })
	function dispatch(cmd: PasswordResetCreateCommand | PasswordResetApplyCommand | PasswordResetGetCommand) {
		if (cmd instanceof PasswordResetCreateCommand) return create.execute(cmd)
		if (cmd instanceof PasswordResetGetCommand) return get.execute(cmd)
		return apply.execute(cmd)
	}
	beforeAll(async () => {
		if (!new URL(url).pathname.startsWith('/xpert_reset_test_'))
			throw new Error('Dedicated reset test database required')
		db = await new DataSource({
			type: 'postgres',
			url,
			schema,
			extra: { options: '-c search_path=' + schema + ',public' },
			entities: [
				Email,
				Tenant,
				Organization,
				EmailTemplate,
				User,
				new EntitySchema<PasswordReset>({
					name: 'PasswordReset',
					target: PasswordReset,
					tableName: 'password_reset',
					columns: {
						id: { type: 'uuid', primary: true, generated: 'uuid' },
						token: { type: String },
						email: { type: String },
						userId: { type: 'uuid', nullable: true },
						tenantId: { type: 'uuid', nullable: true },
						createdAt: { type: 'timestamptz', createDate: true }
					}
				})
			]
		}).initialize()
		await db.query(`CREATE SCHEMA "${schema}"`)
		await db.synchronize()
		await db.query('ALTER TABLE password_reset DROP COLUMN "tenantId", DROP COLUMN "userId"')
		await db.query('INSERT INTO password_reset(email,token) VALUES ($1,$2)', [original.email, legacyJwt])
		await db.query(
			"INSERT INTO email_template(name,\"languageCode\") VALUES ('password/html','en'),('welcome-user/html','en')"
		)
		const archivedLink = `https://example.invalid/auth/reset-password?token=${archivedJwt}&amp;email=owner`
		await db.query(
			`INSERT INTO email_sent (name,email,content,"emailTemplateId")
			SELECT name,$1,CASE WHEN name='password/html' THEN $2 ELSE 'Welcome' END,id FROM email_template`,
			[original.email, archivedLink]
		)
		await db.query(sql(migration))
		await db.query(sql(migration))
		const history = await db.query('SELECT content FROM email_sent ORDER BY name')
		expect(history).toEqual([{ content: archivedLink.replace(archivedJwt, '[redacted]') }, { content: 'Welcome' }])
		expect(await db.manager.countBy(PasswordReset, { token: tokenDigest(archivedJwt) })).toBe(1)
		expect(await db.query(sql('checks/' + migration))).toEqual([])
		create = new PasswordResetCreateHandler(new PasswordResetService(db.getRepository(PasswordReset)))
		apply = new PasswordResetApplyHandler(db)
		get = new PasswordResetGetHandler(new PasswordResetService(db.getRepository(PasswordReset)))
		auth = Object.assign(Object.create(AuthService.prototype), { saltRounds: 4, commandBus: { execute: dispatch } })
	})
	afterAll(async () => {
		if (db?.isInitialized) {
			try {
				await db.query(`DROP SCHEMA "${schema}" CASCADE`)
			} finally {
				await db.destroy()
			}
		}
	})
	beforeEach(async () => {
		await db.query('DELETE FROM reset_user_fixture')
		await db.query('DELETE FROM password_reset WHERE "userId" IS NOT NULL')
		await db.manager.insert(User, { ...original, hash: 'original', emailVerified: false })
	})

	it('delivers the live link while the sent-mail archive retains only non-secret delivery details', async () => {
		const sender = new EmailService(db.getRepository(Email), db.getRepository(EmailTemplate), undefined, undefined)
		const url = 'https://example.invalid/auth/reset-password?token=' + (await issue())
		const send = jest.fn(async () => ({
			originalMessage: { subject: 'Reset audit test', html: `<a href="${url}">reset</a>` }
		}))
		jest.spyOn(sender, 'getEmailInstance').mockResolvedValue({ send } as never)
		await sender.requestPassword(original as User, url, LanguagesEnum.English, null)
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ locals: expect.objectContaining({ generatedUrl: url }) })
		)
		const sent = await db.getRepository(Email).findOneByOrFail({ name: 'Reset audit test' })
		expect(sent.email).toBe(original.email)
		expect(sent.content).toBe('')
	})
	it('stores independent digests bound to the account and leaves a namesake tenant untouched', async () => {
		const other = { ...original, id: randomUUID(), tenantId: randomUUID() }
		await db.manager.insert(User, { ...other, hash: 'other', emailVerified: false })
		const token = await issue()
		expect(token).not.toBe(await issue())
		expect(await row(token)).toMatchObject({
			userId: original.id,
			tenantId: original.tenantId,
			email: original.email
		})
		expect(await db.manager.countBy(PasswordReset, { token })).toBe(0)
		await expect(redeem(tokenDigest(token))).rejects.toMatchObject({ status: 400 })
		await expect(redeem(token)).resolves.toBe(true)
		const saved = await db.manager.findOneByOrFail(User, { id: original.id })
		expect(saved.emailVerified).toBe(true)
		expect(await bcrypt.compare('replacement', saved.hash)).toBe(true)
		expect((await db.manager.findOneByOrFail(User, { id: other.id })).hash).toBe('other')
		await expect(redeem(token)).rejects.toMatchObject({ status: 400 })
	})
	it('binds a tenantless account to NULL rather than accepting a later tenant assignment', async () => {
		await db.manager.update(User, { id: original.id }, { tenantId: null })
		const live = await issue({ ...original, tenantId: null })
		await expect(redeem(live)).resolves.toBe(true)
		const stale = await issue({ ...original, tenantId: null })
		await db.manager.update(User, { id: original.id }, { tenantId: randomUUID() })
		await expect(redeem(stale)).rejects.toMatchObject({ status: 400 })
		expect(await row(stale)).not.toBeNull()
	})
	it('rejects expired tickets and restores a live one if the password write fails', async () => {
		const expired = await issue()
		await db.manager.update(
			PasswordReset,
			{ token: tokenDigest(expired) },
			{ createdAt: new Date(Date.now() - resetTokenLifetimeMs - 1000) }
		)
		await expect(redeem(expired)).rejects.toMatchObject({ status: 400 })
		const live = await issue()
		await db.query("ALTER TABLE reset_user_fixture ADD CHECK (hash='original')")
		try {
			await expect(redeem(live)).rejects.toThrow()
			expect(await row(live)).not.toBeNull()
		} finally {
			await db.query('ALTER TABLE reset_user_fixture DROP CONSTRAINT reset_user_fixture_hash_check')
		}
		await expect(redeem(live)).resolves.toBe(true)
	})

	// Hold the user row until UPDATE actually waits. The predicate must be rechecked after the concurrent edit commits.
	it.each(['email', 'tenant', 'deleted', 'soft-deleted'] as const)(
		'rolls back consumption after a concurrent %s change',
		async (change) => {
			const token = await issue()
			const lock = db.createQueryRunner()
			await lock.connect()
			await lock.startTransaction()
			let result: Promise<PromiseSettledResult<boolean>[]>
			try {
				await lock.query('SELECT id FROM reset_user_fixture WHERE id=$1 FOR UPDATE', [original.id])
				result = Promise.allSettled([redeem(token)])
				await waitForLock('UPDATE', 'reset_user_fixture', 1)
				if (change === 'email')
					await lock.manager.update(User, { id: original.id }, { email: 'replacement@example.invalid' })
				if (change === 'tenant')
					await lock.manager.update(User, { id: original.id }, { tenantId: randomUUID() })
				if (change === 'deleted') await lock.manager.delete(User, { id: original.id })
				if (change === 'soft-deleted') await lock.manager.softDelete(User, { id: original.id })
				await lock.commitTransaction()
			} finally {
				await release(lock)
			}
			expect(await result).toEqual([
				expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ status: 400 }) })
			])
			expect(await row(token)).not.toBeNull()
			if (change !== 'deleted')
				expect(await db.manager.findOne(User, { where: { id: original.id }, withDeleted: true })).toMatchObject(
					{ hash: 'original', emailVerified: false }
				)
		}
	)
	it('allows exactly one winner when two clients consume the same ticket concurrently', async () => {
		const token = await issue()
		const lock = db.createQueryRunner()
		await lock.connect()
		await lock.startTransaction()
		let results: Promise<PromiseSettledResult<boolean>[]>
		try {
			await lock.query('LOCK TABLE password_reset IN SHARE MODE')
			results = Promise.allSettled([redeem(token), redeem(token)])
			await waitForLock('DELETE', 'password_reset', 2)
			await lock.commitTransaction()
		} finally {
			await release(lock)
		}
		const observed = await results
		expect(observed.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect(observed.filter((r) => r.status === 'rejected')).toHaveLength(1)
		expect(await row(token)).toBeNull()
	})
	async function waitForLock(operation: string, table: string, count: number) {
		const end = Date.now() + 8000
		while (Date.now() < end) {
			const [r] = await db.query(
				"SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",
				[operation + '%' + schema + '%' + table + '%']
			)
			if (r.waiting === count) return
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		throw new Error('Database interleaving was not reached')
	}
	async function release(lock: QueryRunner) {
		if (lock.isTransactionActive) await lock.rollbackTransaction()
		await lock.release()
	}

	it('rejects both new and legacy emailed credentials at authentication before and after redemption', async () => {
		const config = {
			get: (key: string) =>
				({
					JWT_SECRET: secret,
					JWT_REFRESH_SECRET: 'fixture-refresh',
					jwtExpiresIn: '1h',
					jwtRefreshExpiresIn: '1h'
				})[key]
		} as ConfigService
		const user = {
			...original,
			isActive: true,
			role: { name: 'USER', rolePermissions: [] },
			employee: { id: randomUUID() }
		}
		const email = jest.fn()
		const service: AuthService = Object.assign(Object.create(AuthService.prototype), {
			dataSource: db,
			saltRounds: 4,
			_configService: config,
			userRepository: { find: async () => [user] },
			userService: {
				getIfExists: async (id: string) => (id === user.id ? user : null),
				checkIfExists: async (id: string) => id === user.id,
				findOneByOptions: async () => user
			},
			userOrganizationService: { findOneByOptions: async () => ({ organizationId: randomUUID() }) },
			emailService: { requestPassword: email },
			commandBus: { execute: dispatch }
		})
		const authenticate = (jwt: string, transport: 'bearer' | 'ws' | 'x-api-key' = 'bearer') =>
			new Promise<boolean>((resolve, reject) => {
				const strategy =
					transport === 'ws' ? new WsJwtStrategy(service, config) : new JwtStrategy(service, config)
				strategy.success = () => resolve(true)
				strategy.fail = () => resolve(false)
				strategy.error = (e) => (e instanceof Error && 'getStatus' in e ? resolve(false) : reject(e))
				const headers = transport === 'x-api-key' ? { 'x-api-key': jwt } : { authorization: 'Bearer ' + jwt }
				strategy.authenticate({ headers } as Request)
			})
		const login = await service.createToken(user as unknown as User)
		expect(verify(login.token, secret)).toMatchObject({ purpose: 'access' })
		const olderLogin = sign({ id: user.id, role: 'USER', tenantId: user.tenantId, iat: 1 }, secret)
		for (const token of [login.token, olderLogin]) {
			expect(await authenticate(token)).toBe(true)
			expect(await authenticate(token, 'ws')).toBe(true)
			expect(await authenticate(token, 'x-api-key')).toBe(true)
			expect(await service.isAuthenticated(token)).toBe(true)
			expect(await service.hasRole(token, ['USER'])).toBe(true)
		}
		for (const purpose of ['artifact_share', 'unknown', '', null, 0, {}]) {
			const token = sign({ id: user.id, role: 'USER', purpose }, secret)
			expect(await authenticate(token)).toBe(false)
			expect(await authenticate(token, 'ws')).toBe(false)
			expect(await authenticate(token, 'x-api-key')).toBe(false)
			expect(await service.isAuthenticated(token)).toBe(false)
			expect(await service.hasRole(token, ['USER'])).toBe(false)
		}
		expect((await row(legacyJwt)).userId).toBeNull()
		expect(await authenticate(archivedJwt)).toBe(false)
		expect(await authenticate(legacyJwt)).toBe(false)
		expect(await authenticate(legacyJwt, 'ws')).toBe(false)
		expect(await service.isAuthenticated(legacyJwt)).toBe(false)
		expect(await service.hasRole(legacyJwt, ['USER'])).toBe(false)
		await expect(
			service.resetPassword({ token: login.token, password: 'test', confirmPassword: 'test' })
		).rejects.toMatchObject({ status: 400 })
		await expect(redeem(legacyJwt)).rejects.toMatchObject({ status: 400 })
		const hash = jest.spyOn(service, 'getPasswordHash')
		await expect(
			service.resetPassword({ token: 'pr_' + 'x'.repeat(43), password: 'invalid', confirmPassword: 'invalid' })
		).rejects.toMatchObject({ status: 400 })
		expect(hash).not.toHaveBeenCalled()

		await service.requestPassword({ email: user.email }, LanguagesEnum.English)
		await service.requestResetPassword({ email: user.email }, LanguagesEnum.English)
		expect(email).toHaveBeenCalledTimes(2)
		for (const [, link] of email.mock.calls) {
			const token = new URL(link, 'https://example.invalid').searchParams.get('token')
			expect(token).toMatch(/^pr_[A-Za-z0-9_-]{43}$/)
			expect(await authenticate(token)).toBe(false)
			await expect(
				service.resetPassword({ token, password: 'changed', confirmPassword: 'changed' })
			).resolves.toBe(true)
			expect(await authenticate(token)).toBe(false)
			expect(await authenticate(token, 'ws')).toBe(false)
		}
		const rolling = sign({ id: user.id, iat: 111 }, secret)
		await db.query('INSERT INTO password_reset(email,token) VALUES ($1,$2)', [user.email, rolling])
		expect((await row(rolling)).userId).toBeNull()
		expect(await authenticate(rolling)).toBe(false)
		const lateArchive = sign({ id: user.id, iat: 3333 }, secret)
		await db.query(
			`INSERT INTO email_sent(name,email,content,"emailTemplateId")
			SELECT 'late', $1, $2, id FROM email_template WHERE name='password/html'`,
			[user.email, `https://example.invalid/auth/reset-password?token=${lateArchive}`]
		)
		expect((await db.getRepository(Email).findOneByOrFail({ name: 'late' })).content).toContain('token=[redacted]')
		expect(await authenticate(lateArchive)).toBe(false)
	})
})
