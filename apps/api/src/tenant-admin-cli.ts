type TenantAdminAction = 'list' | 'get' | 'create' | 'update' | 'delete'

type TenantAdminArgs = {
	action?: string
	id?: string
	name?: string
	tenant?: string
	tenantName?: string
	subdomain?: string
	clearSubdomain?: boolean
	confirm?: string
}

type TenantUpdateInput = {
	name?: string
	subdomain?: string | null
}

type TenantAdminRecord = {
	id: string
	name?: string
	subdomain?: string | null
	createdAt?: Date
	updatedAt?: Date
	[key: string]: unknown
}

type TenantAdminFindOneOptions = {
	where: {
		id?: string
		name?: string
		subdomain?: string
	}
}

type TenantAdminService = {
	findAll: (filter?: unknown) => Promise<unknown>
	findOne: (idOrOptions: string | TenantAdminFindOneOptions) => Promise<TenantAdminRecord>
	prepareTenantUpdateInput: (tenantId: string, entity: TenantUpdateInput) => Promise<TenantUpdateInput>
	update: (tenantId: string, entity: TenantUpdateInput) => Promise<unknown>
	delete: (tenantId: string) => Promise<{ affected?: number }>
}

type TenantAdminDependencies = {
	service: TenantAdminService
	seedTenant: (tenantName: string) => Promise<void>
	output?: (value: unknown) => void
}

type TenantAdminApplication = {
	get: (token: unknown) => TenantAdminService
	close: () => Promise<void>
}

type TenantAdminRuntimeDependencies = {
	createApp?: () => Promise<TenantAdminApplication>
	serviceToken?: any
	seedTenant?: (tenantName: string) => Promise<void>
	output?: (value: unknown) => void
}

export async function runTenantAdminCli(
	args: TenantAdminArgs,
	pluginConfig: Partial<unknown>,
	dependencies: TenantAdminRuntimeDependencies = {}
) {
	const seedTenant =
		dependencies.seedTenant ??
		((tenantName: string) => seedModule(pluginConfig, { name: 'Tenant', tenantName }))
	const action = normalizeAction(args.action)
	if (action === 'create') {
		await seedTenant(getRequiredTenantName(args))
	}

	const app = await (dependencies.createApp ?? (() => createTenantAdminApp(pluginConfig)))()
	try {
		const serviceToken = dependencies.serviceToken ?? (await getTenantServiceToken())
		await runTenantAdminCommand(args, {
			service: app.get(serviceToken),
			seedTenant: action === 'create' ? async () => undefined : seedTenant,
			output: dependencies.output
		})
	} finally {
		await app.close()
	}
}

async function seedModule(pluginConfig: Partial<unknown>, options: { name: string; tenantName: string }) {
	const analytics = await import('@xpert-ai/analytics')

	return analytics.seedModule(pluginConfig, options)
}

export async function runTenantAdminCommand(args: TenantAdminArgs, dependencies: TenantAdminDependencies) {
	const action = normalizeAction(args.action)
	const output = dependencies.output ?? printJson

	switch (action) {
		case 'list':
			return listTenants(dependencies.service, output)
		case 'get':
			return getTenant(args, dependencies.service, output)
		case 'create':
			return createTenant(args, dependencies, output)
		case 'update':
			return updateTenant(args, dependencies.service, output)
		case 'delete':
			return deleteTenant(args, dependencies.service, output)
	}
}

async function createTenantAdminApp(pluginConfig: Partial<unknown>) {
	const [{ NestFactory }, { registerPluginConfig }, { AppModule }] = await Promise.all([
		import('@nestjs/core'),
		import('@xpert-ai/server-core'),
		import('./app/app.module')
	])

	await registerPluginConfig(pluginConfig)

	return NestFactory.createApplicationContext(AppModule, {
		logger: ['log', 'error', 'warn']
	})
}

async function getTenantServiceToken() {
	const { TenantService } = await import('@xpert-ai/server-core')

	return TenantService
}

function normalizeAction(action: string | undefined): TenantAdminAction {
	if (!action) {
		throw new Error('Tenant command requires --action list|get|create|update|delete')
	}

	if (['list', 'get', 'create', 'update', 'delete'].includes(action)) {
		return action as TenantAdminAction
	}

	throw new Error(`Unknown tenant action: ${action}`)
}

async function listTenants(service: TenantAdminService, output: (value: unknown) => void) {
	const result = await service.findAll({
		order: {
			createdAt: 'DESC'
		}
	})

	output(serializeTenantResult(result))
}

async function getTenant(args: TenantAdminArgs, service: TenantAdminService, output: (value: unknown) => void) {
	const selectors = [args.id, args.name ?? args.tenantName ?? args.tenant, args.subdomain].filter(Boolean)
	if (selectors.length !== 1) {
		throw new Error('Pass exactly one selector: --id, --name, or --subdomain')
	}

	if (args.id) {
		output(serializeTenantResult(await service.findOne(args.id)))
		return
	}

	const name = args.name ?? args.tenantName ?? args.tenant
	if (name) {
		output(
			serializeTenantResult(
				await service.findOne({
					where: {
						name
					}
				})
			)
		)
		return
	}

	output(
		serializeTenantResult(
			await service.findOne({
				where: {
					subdomain: args.subdomain
				}
			})
		)
	)
}

async function createTenant(
	args: TenantAdminArgs,
	dependencies: TenantAdminDependencies,
	output: (value: unknown) => void
) {
	const tenantName = getRequiredTenantName(args)
	const subdomain = args.subdomain ?? tenantName

	await dependencies.seedTenant(tenantName)

	const tenant = await dependencies.service.findOne({
		where: {
			name: tenantName
		}
	})
	const prepared = await dependencies.service.prepareTenantUpdateInput(tenant.id, {
		name: tenantName,
		subdomain
	})

	await dependencies.service.update(tenant.id, prepared)
	output(serializeTenantResult(await dependencies.service.findOne(tenant.id)))
}

async function updateTenant(args: TenantAdminArgs, service: TenantAdminService, output: (value: unknown) => void) {
	if (!args.id) {
		throw new Error('Tenant update requires --id')
	}

	const hasName = typeof args.name === 'string' || typeof args.tenantName === 'string' || typeof args.tenant === 'string'
	const hasSubdomain = typeof args.subdomain === 'string'
	const clearsSubdomain = Boolean(args.clearSubdomain)
	if (!hasName && !hasSubdomain && !clearsSubdomain) {
		throw new Error('Pass at least one update field: --name, --subdomain, or --clear-subdomain')
	}

	const input: TenantUpdateInput = {}
	const name = args.name ?? args.tenantName ?? args.tenant
	if (hasName) {
		input.name = name
	}
	if (hasSubdomain) {
		input.subdomain = args.subdomain
	}

	const prepared = await service.prepareTenantUpdateInput(args.id, input)
	if (clearsSubdomain) {
		prepared.subdomain = null
	}

	await service.update(args.id, prepared)
	output(serializeTenantResult(await service.findOne(args.id)))
}

async function deleteTenant(args: TenantAdminArgs, service: TenantAdminService, output: (value: unknown) => void) {
	if (!args.id) {
		throw new Error('Tenant delete requires --id')
	}
	if (args.confirm !== args.id) {
		throw new Error(`Delete requires --confirm ${args.id}`)
	}

	const result = await service.delete(args.id)
	output({
		deleted: result.affected ?? 0
	})
}

function getRequiredTenantName(args: TenantAdminArgs) {
	const tenantName = args.tenant ?? args.tenantName ?? args.name
	if (!tenantName) {
		throw new Error('Tenant create requires --tenant or --name')
	}

	return tenantName
}

function serializeTenantResult(value: any): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => serializeTenantResult(item))
	}

	if (value && Array.isArray(value.items)) {
		return {
			...value,
			items: value.items.map((item) => serializeTenantResult(item))
		}
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				item instanceof Date ? item.toISOString() : item
			])
		)
	}

	return value
}

function printJson(value: unknown) {
	console.log(JSON.stringify(value, null, 2))
}
