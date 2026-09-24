// Why this exists: Docker replaces the root manifest for each installation stage.
// Each layout has a committed lock. Source manifests own dependency declarations;
// compiler-generated manifests supply runtime entry points, not new resolutions.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const packages = [
  'auth',
  'common',
  'config',
  'contracts',
  'desktop-protocol',
  'plugin-sdk',
  'server',
  'server-ai',
  'shadcn-ui',
  'plugins/draft',
  'plugins/vlm-default'
].map((name) => `packages/${name}`)
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'peerDependenciesMeta'
]

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, { recursive: true, filter: (file) => path.basename(file) !== 'node_modules' })
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function profile(stage) {
  if (!['build', 'production'].includes(stage)) throw new Error(`Unknown dependency stage: ${stage}`)
  return {
    manifest: `.deploy/api/${stage === 'build' ? 'package.json' : 'package-prod.json'}`,
    lock: `.deploy/api/pnpm-lock.${stage}.yaml`
  }
}

function prepareManifestWorkspace(stage, destination, sourceRoot = root, seedLock) {
  const files = profile(stage)
  copy(path.join(sourceRoot, files.manifest), path.join(destination, 'package.json'))
  for (const file of ['pnpm-workspace.yaml', '.npmrc']) copy(path.join(sourceRoot, file), path.join(destination, file))
  const directories = stage === 'build' ? [...packages, 'apps/api'] : packages
  for (const dir of directories)
    copy(path.join(sourceRoot, dir, 'package.json'), path.join(destination, dir, 'package.json'))
  copy(seedLock ?? path.join(sourceRoot, files.lock), path.join(destination, 'pnpm-lock.yaml'))
}

function runPnpm(args, cwd) {
  const result = spawnSync('corepack', ['pnpm', ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed (${result.status})`)
}

function maintainLocks(update) {
  for (const stage of ['build', 'production']) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `xpert-api-${stage}-`))
    try {
      const target = path.join(root, profile(stage).lock)
      // Seed new profiles from reviewed resolutions; subsequent updates retain their own lock.
      const seed =
        !update || fs.existsSync(target)
          ? target
          : path.join(root, stage === 'build' ? 'pnpm-lock.yaml' : profile('build').lock)
      prepareManifestWorkspace(stage, temporary, root, seed)
      console.log(`${update ? 'Updating' : 'Checking'} API ${stage} lock`)
      runPnpm(
        [
          'install',
          '--lockfile-only',
          '--ignore-scripts',
          ...(update ? ['--no-frozen-lockfile'] : ['--frozen-lockfile', '--offline'])
        ],
        temporary
      )
      if (update) copy(path.join(temporary, 'pnpm-lock.yaml'), target)
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  }
}

function runtimeManifest(source, built) {
  if (source.name !== built.name || source.version !== built.version) {
    throw new Error(`Rebuild ${source.name}: runtime manifest name/version differs from source`)
  }
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(built[field] ?? {})) {
      if (!Object.hasOwn(source[field] ?? {}, name)) {
        throw new Error(
          `Declare ${source.name} ${field}.${name} in source and update deployment locks before packaging`
        )
      }
    }
  }
  const result = { ...built }
  for (const field of dependencyFields) {
    delete result[field]
    if (source[field] !== undefined) result[field] = source[field]
  }
  return result
}

function prepareRuntime(destination, sourceRoot = root) {
  if (fs.existsSync(destination)) throw new Error(`Runtime destination must not exist: ${destination}`)
  copy(path.join(sourceRoot, 'dist/apps/api'), destination)
  for (const dir of packages) {
    const source = readJson(path.join(sourceRoot, dir, 'package.json'))
    const target = path.join(destination, dir)
    const projectFile = path.join(sourceRoot, dir, 'project.json')
    if (!fs.existsSync(projectFile)) {
      // desktop-protocol ships JavaScript directly and is a server-ai workspace dependency.
      for (const file of source.files ?? []) copy(path.join(sourceRoot, dir, file), path.join(target, file))
      writeJson(path.join(target, 'package.json'), source)
      continue
    }
    const output = readJson(projectFile).targets.build.options.outputPath
    const builtDirectory = path.join(sourceRoot, output)
    const built = readJson(path.join(builtDirectory, 'package.json'))
    const manifest = runtimeManifest(source, built)
    if (source.publishConfig?.directory) {
      // pnpm links these packages to their nested publish directory.
      copy(builtDirectory, path.join(target, source.publishConfig.directory))
      writeJson(path.join(target, source.publishConfig.directory, 'package.json'), manifest)
      writeJson(path.join(target, 'package.json'), source)
    } else {
      copy(builtDirectory, target)
      writeJson(path.join(target, 'package.json'), manifest)
      // Preserve the legacy dist lookup layout used by the API runtime.
      copy(target, path.join(destination, 'dist', dir))
    }
  }
  const files = profile('production')
  copy(path.join(sourceRoot, files.manifest), path.join(destination, 'package.json'))
  copy(path.join(sourceRoot, files.lock), path.join(destination, 'pnpm-lock.yaml'))
  for (const file of ['pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json'])
    copy(path.join(sourceRoot, file), path.join(destination, file))
}

if (require.main === module) {
  const [command, target] = process.argv.slice(2)
  if (command === 'update' || command === 'check') maintainLocks(command === 'update')
  else if (command === 'prepare-runtime' && target) prepareRuntime(path.resolve(target))
  else throw new Error('Usage: node .deploy/api/dependencies.cjs update|check|prepare-runtime <new-directory>')
}

module.exports = { packages, prepareManifestWorkspace, prepareRuntime, runtimeManifest }
