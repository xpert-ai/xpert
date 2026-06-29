import { runTenantAdminCommand } from './tenant-admin-cli'

describe('runTenantAdminCommand', () => {
	let service: any
	let seedTenant: jest.Mock
	let output: jest.Mock

	beforeEach(() => {
		service = {
			findAll: jest.fn().mockResolvedValue({
				items: [
					{
						id: 'tenant-1',
						name: 'Tenant One',
						subdomain: 'tenant-one',
						createdAt: new Date('2026-01-01T00:00:00.000Z'),
						updatedAt: new Date('2026-01-02T00:00:00.000Z')
					}
				],
				total: 1
			}),
			findOne: jest.fn().mockResolvedValue({
				id: 'tenant-1',
				name: 'Tenant One',
				subdomain: 'tenant-one'
			}),
			prepareTenantUpdateInput: jest.fn().mockResolvedValue({
				name: 'Tenant Two',
				subdomain: 'tenant-two'
			}),
			update: jest.fn().mockResolvedValue({ affected: 1 }),
			delete: jest.fn().mockResolvedValue({ affected: 1 })
		}
		seedTenant = jest.fn().mockResolvedValue(undefined)
		output = jest.fn()
	})

	it('lists tenants through TenantService', async () => {
		await runTenantAdminCommand({ action: 'list' }, { service, seedTenant, output })

		expect(service.findAll).toHaveBeenCalledWith({
			order: {
				createdAt: 'DESC'
			}
		})
		expect(output).toHaveBeenCalledWith({
			items: [
				{
					id: 'tenant-1',
					name: 'Tenant One',
					subdomain: 'tenant-one',
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-02T00:00:00.000Z'
				}
			],
			total: 1
		})
	})

	it('gets a tenant by one selector', async () => {
		await runTenantAdminCommand({ action: 'get', subdomain: 'tenant-one' }, { service, seedTenant, output })

		expect(service.findOne).toHaveBeenCalledWith({
			where: {
				subdomain: 'tenant-one'
			}
		})
		expect(output).toHaveBeenCalledWith({
			id: 'tenant-1',
			name: 'Tenant One',
			subdomain: 'tenant-one'
		})
	})

	it('creates a tenant through the existing seed flow then updates subdomain through TenantService', async () => {
		await runTenantAdminCommand(
			{
				action: 'create',
				tenant: 'Tenant One',
				subdomain: 'tenant-one'
			},
			{ service, seedTenant, output }
		)

		expect(seedTenant).toHaveBeenCalledWith('Tenant One')
		expect(service.findOne).toHaveBeenCalledWith({
			where: {
				name: 'Tenant One'
			}
		})
		expect(service.prepareTenantUpdateInput).toHaveBeenCalledWith('tenant-1', {
			name: 'Tenant One',
			subdomain: 'tenant-one'
		})
		expect(service.update).toHaveBeenCalledWith('tenant-1', {
			name: 'Tenant Two',
			subdomain: 'tenant-two'
		})
	})

	it('uses the tenant name as the default subdomain when creating a tenant', async () => {
		await runTenantAdminCommand(
			{
				action: 'create',
				tenant: 'Tenant One'
			},
			{ service, seedTenant, output }
		)

		expect(seedTenant).toHaveBeenCalledWith('Tenant One')
		expect(service.prepareTenantUpdateInput).toHaveBeenCalledWith('tenant-1', {
			name: 'Tenant One',
			subdomain: 'Tenant One'
		})
	})

	it('updates a tenant through TenantService preparation instead of direct SQL', async () => {
		await runTenantAdminCommand(
			{
				action: 'update',
				id: 'tenant-1',
				name: 'Tenant Two',
				subdomain: 'tenant-two'
			},
			{ service, seedTenant, output }
		)

		expect(service.prepareTenantUpdateInput).toHaveBeenCalledWith('tenant-1', {
			name: 'Tenant Two',
			subdomain: 'tenant-two'
		})
		expect(service.update).toHaveBeenCalledWith('tenant-1', {
			name: 'Tenant Two',
			subdomain: 'tenant-two'
		})
	})

	it('requires delete confirmation before deleting a tenant', async () => {
		await expect(
			runTenantAdminCommand(
				{
					action: 'delete',
					id: 'tenant-1'
				},
				{ service, seedTenant, output }
			)
		).rejects.toThrow('Delete requires --confirm tenant-1')

		expect(service.delete).not.toHaveBeenCalled()
	})

	it('deletes a tenant when confirmation matches', async () => {
		await runTenantAdminCommand(
			{
				action: 'delete',
				id: 'tenant-1',
				confirm: 'tenant-1'
			},
			{ service, seedTenant, output }
		)

		expect(service.delete).toHaveBeenCalledWith('tenant-1')
		expect(output).toHaveBeenCalledWith({
			deleted: 1
		})
	})
})
