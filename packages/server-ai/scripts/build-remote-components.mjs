import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = findWorkspaceRoot(packageRoot)
const sourceRoot = join(packageRoot, 'src')
const buildScripts = (await findRemoteComponentBuildScripts(sourceRoot)).sort()

if (!buildScripts.length) {
    console.log('No server-ai remote component build scripts found.')
    process.exit(0)
}

for (const scriptPath of buildScripts) {
    console.log(`Building server-ai remote component: ${relative(packageRoot, dirname(scriptPath))}`)
    execFileSync(process.execPath, [scriptPath], {
        cwd: workspaceRoot,
        stdio: 'inherit'
    })
}

async function findRemoteComponentBuildScripts(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const nestedScripts = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = join(dir, entry.name)

            if (entry.isDirectory()) {
                return findRemoteComponentBuildScripts(entryPath)
            }

            if (entry.isFile() && entry.name === 'build.mjs' && isRemoteComponentBuildScript(entryPath)) {
                return [entryPath]
            }

            return []
        })
    )

    return nestedScripts.flat()
}

function isRemoteComponentBuildScript(scriptPath) {
    const parts = scriptPath.split(sep)
    const remoteComponentsIndex = parts.lastIndexOf('remote-components')

    return (
        remoteComponentsIndex >= 0 &&
        Boolean(parts[remoteComponentsIndex + 1]) &&
        parts[parts.length - 1] === 'build.mjs'
    )
}

function findWorkspaceRoot(startDir) {
    let current = startDir

    while (current !== dirname(current)) {
        if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
            return current
        }

        current = dirname(current)
    }

    return resolve(startDir)
}
