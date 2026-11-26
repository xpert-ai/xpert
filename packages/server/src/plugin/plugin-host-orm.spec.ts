import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { assertPluginSdkCompatibility, ensureHostPluginOrmLinks } from './plugin-sdk-versioning'

const pluginName = '@test/scoped-inventory'
const hostRoot = process.cwd()
const peers = { typeorm: '^0.3.20', '@nestjs/typeorm': '^11.0.0' }

describe('host ORM peers for staged plugins', () => {
	let root: string
	let packageDir: string
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'xpert-host-orm-'))
		packageDir = join(root, 'node_modules', pluginName)
		mkdirSync(packageDir, { recursive: true })
		writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: pluginName, peerDependencies: peers }))
	})
	afterEach(() => rmSync(root, { recursive: true, force: true }))

	it('rejects private ORM copies at installation validation before plugin code can start the API', () => {
		for (const packageName of Object.keys(peers)) {
			for (const field of ['dependencies', 'optionalDependencies'] as const) {
				expect(() =>
					assertPluginSdkCompatibility(
						{
							name: pluginName,
							[field]: { [packageName]: '*' }
						},
						{ hostVersion: '3.38.0' }
					)
				).toThrow(`${packageName} must be a peerDependency`)
			}
		}
	})

	it('validates both peers before changing any staged dependency', () => {
		writeFileSync(
			join(packageDir, 'package.json'),
			JSON.stringify({
				name: pluginName,
				peerDependencies: { typeorm: '^0.3.20', '@nestjs/typeorm': '^999.0.0' }
			})
		)
		expect(() => ensureHostPluginOrmLinks(pluginName, root)).toThrow('incompatible with host version')
		expect(existsSync(join(root, 'node_modules', 'typeorm'))).toBe(false)
	})

	it('requires TypeORM to be explicitly declared when using Nest ORM', () => {
		expect(() =>
			assertPluginSdkCompatibility(
				{
					name: pluginName,
					peerDependencies: { '@nestjs/typeorm': '^11.0.0' }
				},
				{ hostVersion: '3.38.0' }
			)
		).toThrow('requires an explicit typeorm peerDependency')
	})

	it('does not add database dependencies to plugins that do not declare them', () => {
		writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: pluginName }))
		ensureHostPluginOrmLinks(pluginName, root)
		expect(existsSync(join(root, 'node_modules', 'typeorm'))).toBe(false)
	})

	it('shares DataSource, entity registration and actual Nest repository injection across the staged boundary', () => {
		const nestedModules = join(packageDir, 'node_modules')
		const privateTypeorm = join(nestedModules, 'typeorm')
		mkdirSync(privateTypeorm, { recursive: true })
		writeFileSync(join(privateTypeorm, 'package.json'), JSON.stringify({ name: 'typeorm', main: 'index.js' }))
		writeFileSync(
			join(privateTypeorm, 'index.js'),
			`const host = require(${JSON.stringify(require.resolve('typeorm'))}); module.exports = {...host, DataSource: class PrivateDataSource extends host.DataSource {}};`
		)
		const privateNestOrm = join(nestedModules, '@nestjs', 'typeorm')
		mkdirSync(dirname(privateNestOrm), { recursive: true })
		cpSync(dirname(require.resolve('@nestjs/typeorm/package.json')), privateNestOrm, { recursive: true })
		for (const name of ['@nestjs/common', '@nestjs/core', 'rxjs', 'reflect-metadata']) {
			const target = join(root, 'node_modules', name)
			mkdirSync(dirname(target), { recursive: true })
			symlinkSync(join(hostRoot, 'node_modules', name), target, 'junction')
		}

		// Native Node, not Jest's module registry, must reproduce and then resolve the
		// constructor and entity-storage split seen in installed archive/source plugins.
		const script = join(root, 'probe.cjs')
		writeFileSync(
			script,
			`
const {createRequire} = require('node:module');
const host = createRequire(${JSON.stringify(join(hostRoot, 'package.json'))});
const plugin = createRequire(${JSON.stringify(join(packageDir, 'index.js'))});
const orm = host('typeorm'), stagedOrm = plugin('typeorm');
const nestOrm = plugin('@nestjs/typeorm');
const {Global, Module} = host('@nestjs/common');
const {Test} = host('@nestjs/testing');
class Device {}
stagedOrm.Entity()(Device);
stagedOrm.PrimaryColumn({type:'varchar'})(Device.prototype, 'id');
const source = new orm.DataSource({type:'postgres', entities:[Device]});
class HostDatabase {}
Global()(HostDatabase);
Module({providers:[{provide:orm.DataSource,useValue:source}],exports:[orm.DataSource]})(HostDatabase);
const feature = nestOrm.TypeOrmModule.forFeature([Device]);
const storage = host('@nestjs/typeorm/dist/entities-metadata.storage');
const result = {sameConstructor: stagedOrm.DataSource === orm.DataSource,
  entityRegistered: storage.EntitiesMetadataStorage.getEntitiesByDataSource('default').includes(Device)};
(async () => {
  try {
    const container = await Test.createTestingModule({imports:[HostDatabase,feature]}).compile();
    result.repositoryUsesHost = container.get(nestOrm.getRepositoryToken(Device)).manager.connection === source;
    await container.close();
  } catch(error) { result.error = error.message; }
  process.stdout.write(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
`
		)
		const before = execFileSync(process.execPath, [script], { encoding: 'utf8' })
		expect(JSON.parse(before)).toMatchObject({
			sameConstructor: false,
			entityRegistered: false,
			error: expect.stringContaining('DataSource')
		})
		ensureHostPluginOrmLinks(pluginName, root)
		ensureHostPluginOrmLinks(pluginName, root)
		const after = execFileSync(process.execPath, [script], { encoding: 'utf8' })
		expect(JSON.parse(after)).toEqual({ sameConstructor: true, entityRegistered: true, repositoryUsesHost: true })
		expect(JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).peerDependencies).toEqual(peers)
	}, 30000)
})
