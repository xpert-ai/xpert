// Invariants: never repair packages or recreate application containers. Probe only explicitly listed replicas.
// A recreation receipt retains unique probe files until all replacement replicas verify them.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isAbsolute, posix, resolve } from 'node:path'
import { parseArgs } from 'node:util'

function runDocker(args, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    const timer = setTimeout(() => child.kill('SIGTERM'), 60000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.stdin.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      code === 0
        ? resolveResult(stdout)
        : reject(new Error(stderr.trim() || `Docker exited ${code} (timeout or failure)`))
    })
    child.stdin.end(input)
  })
}

export function parseInventory(value, root) {
  if (!Array.isArray(value)) throw new Error('Inventory must be an array of database rootPath/digest records')
  const paths = new Set()
  return value.map((pkg) => {
    if (
      !pkg ||
      typeof pkg !== 'object' ||
      typeof pkg.rootPath !== 'string' ||
      !posix.isAbsolute(pkg.rootPath) ||
      posix.normalize(pkg.rootPath) !== pkg.rootPath ||
      typeof pkg.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(pkg.digest)
    )
      throw new Error('Invalid inventory record')
    const child = posix.relative(root, pkg.rootPath)
    if (!child || child === '..' || child.startsWith('../') || posix.isAbsolute(child) || paths.has(pkg.rootPath))
      throw new Error('Inventory path must be unique and inside configured storage')
    paths.add(pkg.rootPath)
    return { rootPath: pkg.rootPath, digest: pkg.digest }
  })
}

export function configuredStoragePath(config) {
  const env = (name) => config.Env?.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
  const configured = env('XPERT_AGENT_PLUGIN_PATH')
  if (configured) return posix.resolve(config.WorkingDir || '/', configured)
  // Standard Docker/production bootstrap sets assetOptions.dataPath to the persistent data mount.
  // Development dataPath depends on the source location and cannot be inferred from Docker's working directory.
  if (env('IS_DOCKER')?.toLowerCase() !== 'true' && env('NODE_ENV') !== 'production')
    throw new Error('Cannot infer development dataPath; storage preflight requires a Docker/production replica')
  return posix.join('/var/lib/xpert/data', 'agent-plugins')
}

export function persistentMount(mounts, root) {
  const covers = (path) => root === path || root.startsWith(`${path.replace(/\/$/, '')}/`)
  const mount = mounts
    .filter((item) => covers(item.Destination))
    .sort((a, b) => b.Destination.length - a.Destination.length)[0]
  if (!mount || !['bind', 'volume'].includes(mount.Type) || !mount.RW)
    throw new Error('Storage must be covered by a writable persistent bind or volume mount')
  if (mounts.some((item) => item.Destination.startsWith(`${root}/`)))
    throw new Error('Nested mounts can hide package files; use one shared storage mount')
  return { type: mount.Type, source: mount.Source, destination: mount.Destination }
}

async function workerSource() {
  const { build } = await import('esbuild')
  const entry = fileURLToPath(new URL('./lib/agent-plugin-storage-probe.ts', import.meta.url))
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false })
  return result.outputFiles[0].text
}

export async function checkStorage({
  containers,
  expectedReplicas,
  root = '/var/lib/xpert/data/agent-plugins',
  inventory,
  prepareRecreation,
  verifyRecreation
}) {
  if (
    !Number.isInteger(expectedReplicas) ||
    expectedReplicas < 1 ||
    containers.length !== expectedReplicas ||
    new Set(containers).size !== containers.length
  )
    throw new Error('List every replica exactly once and supply --expected-replicas')
  if (!posix.isAbsolute(root) || posix.normalize(root) !== root || root === '/')
    throw new Error('Use a normalized absolute storage root')
  if (prepareRecreation && verifyRecreation) throw new Error('Choose prepare or verify recreation')
  inventory = parseInventory(inventory, root)
  const inspected = await Promise.all(
    containers.map(async (container) => {
      const [item] = JSON.parse(await runDocker(['inspect', container]))
      if (!item.State.Running) throw new Error(`Replica ${container} is not running`)
      if (configuredStoragePath(item.Config) !== root)
        throw new Error(`Replica ${container} uses a different Agent Plugin storage directory`)
      return { container, id: item.Id, user: item.Config.User, mount: persistentMount(item.Mounts, root) }
    })
  )
  if (new Set(inspected.map((item) => item.id)).size !== expectedReplicas)
    throw new Error('Replica aliases refer to the same container')
  const source = await workerSource()
  const call = async (replica, operation, probe = '', token = '') => {
    const input = { operation, root, probe, token, inventory }
    const code = `${source}\nmodule.exports.probeStorage(${JSON.stringify(input)}).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.code || error.message); process.exitCode = 1 })`
    return JSON.parse(await runDocker(['exec', '-i', replica.container, 'node', '-'], code))
  }
  const reports = []
  for (const replica of inspected) {
    const result = await call(replica, 'inventory')
    reports.push({ container: replica.container, ...result })
  }
  if (reports.some((item) => item.failures.length))
    throw new Error(`Package verification failed: ${JSON.stringify(reports)}`)
  let previousProbes = []
  if (verifyRecreation) {
    const receipt = JSON.parse(await readFile(verifyRecreation, 'utf8'))
    if (
      receipt.version !== 1 ||
      receipt.root !== root ||
      receipt.replicas?.length !== expectedReplicas ||
      !Array.isArray(receipt.probes) ||
      receipt.probes.length !== expectedReplicas
    )
      throw new Error('Recreation receipt does not match this storage and replica count')
    if (JSON.stringify(receipt.inventory) !== JSON.stringify(inventory))
      throw new Error('Recreation verification must use the same database inventory')
    if (inspected.some((replica) => receipt.replicas.some((old) => old.id === replica.id)))
      throw new Error('Recreation verification requires replacement container IDs for every replica')
    for (const probe of receipt.probes) {
      if (
        typeof probe.name !== 'string' ||
        !/^\.xpert-storage-probe-[a-f0-9-]{36}$/.test(probe.name) ||
        typeof probe.token !== 'string' ||
        !probe.token
      )
        throw new Error('Invalid probe receipt')
      for (const replica of inspected) await call(replica, 'read', probe.name, probe.token)
    }
    previousProbes = receipt.probes
  }
  const probes = []
  let retained = false
  try {
    for (const replica of inspected) {
      const probe = { name: `.xpert-storage-probe-${randomUUID()}`, token: randomUUID(), container: replica.container }
      probes.push(probe)
      await call(replica, 'write', probe.name, probe.token)
      for (const reader of inspected) await call(reader, 'read', probe.name, probe.token)
    }
    if (prepareRecreation) {
      await writeFile(
        prepareRecreation,
        JSON.stringify({ version: 1, root, inventory, replicas: inspected, probes }, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 }
      )
      retained = true
    }
  } finally {
    if (!retained) {
      // Only remove directories generated by this run, including failed writes on isolated storage.
      for (const probe of probes) {
        const writer = inspected.find((item) => item.container === probe.container)
        await call(writer, 'remove', probe.name)
      }
    }
  }
  for (const probe of previousProbes) await call(inspected[0], 'remove', probe.name)
  return {
    ok: true,
    replicas: inspected.length,
    packagesPerReplica: inventory.length,
    packageChecks: inventory.length * inspected.length,
    crossReplicaChecks: inspected.length ** 2,
    recreation: verifyRecreation ? 'verified' : prepareRecreation ? 'prepared' : 'not-checked',
    reports
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      container: { type: 'string', multiple: true },
      'expected-replicas': { type: 'string' },
      inventory: { type: 'string' },
      'storage-root': { type: 'string' },
      'prepare-recreation': { type: 'string' },
      'verify-recreation': { type: 'string' }
    }
  })
  if (!values.inventory || !isAbsolute(values.inventory))
    throw new Error('--inventory requires an absolute path to a read-only database export')
  console.log(
    JSON.stringify(
      await checkStorage({
        containers: values.container ?? [],
        expectedReplicas: Number(values['expected-replicas']),
        root: values['storage-root'],
        inventory: JSON.parse(await readFile(values.inventory, 'utf8')),
        prepareRecreation: values['prepare-recreation'],
        verifyRecreation: values['verify-recreation']
      }),
      null,
      2
    )
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
