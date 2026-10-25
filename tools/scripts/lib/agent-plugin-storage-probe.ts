// The operator probe uses the same content identity and strict file traversal as runtime validation.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { containedPath, PackagePathEscapeError } from '../../../packages/server-ai/src/agent-plugin/agent-plugin-path'
import {
  fileErrorCode,
  portablePackageDigest,
  PortablePackageIntegrityError
} from '../../../packages/server-ai/src/agent-plugin/portable-package-files'

interface Input {
  root: string
  operation: 'write' | 'read' | 'remove' | 'inventory'
  probe: string
  token: string
  inventory: { rootPath: string; digest: string }[]
}

export async function probeStorage(input: Input) {
  const root = await containedPath(input.root, '.')
  if (root !== input.root) throw new Error('Storage root must not traverse symbolic links')
  const probe = join(root, input.probe)
  if (input.operation === 'write') {
    await mkdir(probe)
    await writeFile(join(probe, 'token'), input.token, { flag: 'wx', mode: 0o644 })
  } else if (input.operation === 'read') {
    if ((await readFile(join(probe, 'token'), 'utf8')) !== input.token) throw new Error('Probe content mismatch')
  } else if (input.operation === 'remove') {
    await rm(probe, { recursive: true, force: true })
  } else {
    const failures: { index: number; code: string }[] = []
    for (const [index, pkg] of input.inventory.entries()) {
      const child = relative(input.root, pkg.rootPath)
      if (!child || isAbsolute(child) || child === '..' || child.startsWith('../'))
        throw new Error('Inventory path is outside configured storage')
      try {
        await containedPath(root, child)
        if ((await portablePackageDigest(pkg.rootPath, true)) !== pkg.digest)
          failures.push({ index, code: 'AGENT_PLUGIN_STORAGE_CORRUPT' })
      } catch (error) {
        failures.push({
          index,
          code:
            fileErrorCode(error) === 'ENOENT'
              ? 'AGENT_PLUGIN_STORAGE_MISSING'
              : error instanceof PortablePackageIntegrityError || error instanceof PackagePathEscapeError
                ? 'AGENT_PLUGIN_STORAGE_CORRUPT'
                : 'AGENT_PLUGIN_STORAGE_UNREADABLE'
        })
      }
    }
    return { checked: input.inventory.length, failures }
  }
  return { ok: true }
}
