// Invariants: never check out candidate code. Only a verified Git bundle enters a new
// bare repository; a trusted pre-push hook permits creation of one previously absent ref.
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
export type GitPushInput = {
  remoteUrl: string; baseBranch: string; branch: string; commit: string; bundle: Buffer
  authorizationHeader: string; beforeWrite: () => Promise<void>
}

export const creationOnlyHook = `#!/bin/sh
set -eu
while read local_ref local_oid remote_ref remote_oid; do
  test "$local_oid" = "$XPERT_DELIVERY_COMMIT" || exit 1
  test "$remote_ref" = "refs/heads/$XPERT_DELIVERY_BRANCH" || exit 1
  case "$remote_oid" in *[!0]*) exit 1 ;; esac
done
`

export async function pushApprovedBundle(input: GitPushInput) {
  const directory = await mkdtemp(join(tmpdir(), 'xpert-git-delivery-'))
  // Do not inherit user Git configuration, credential helpers, hooks, or tracing variables.
  const env: NodeJS.ProcessEnv = {
    PATH: '/usr/local/bin:/usr/bin:/bin', HOME: directory, XDG_CONFIG_HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'https:file', GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_1: input.authorizationHeader,
    XPERT_DELIVERY_BRANCH: input.branch, XPERT_DELIVERY_COMMIT: input.commit
  }
  const repo = join(directory, 'repo.git'), bundle = join(directory, 'source.bundle'), hooks = join(directory, 'hooks')
  async function git(args: string[], cwd = repo) {
    try {
      const result = await execute('git', ['-c', 'protocol.ext.allow=never', '-c', 'fetch.recurseSubmodules=false',
        '-c', 'http.followRedirects=false', '-c', `core.hooksPath=${hooks}`, ...args],
      { cwd, env, timeout: 180000, maxBuffer: 1024 * 1024 })
      return result.stdout.trim()
    } catch {
      // Git's raw error may contain server-controlled URLs or authentication diagnostics.
      throw new Error('CODING_GIT_COMMAND_FAILED')
    }
  }
  try {
    await mkdir(hooks); await writeFile(join(hooks, 'pre-push'), creationOnlyHook, { mode: 0o700 })
    await writeFile(bundle, input.bundle, { mode: 0o600 })
    await git(['init', '--bare', repo], directory)
    await git(['remote', 'add', 'origin', input.remoteUrl])
    await git(['fetch', '--no-tags', 'origin', `refs/heads/${input.baseBranch}:refs/remotes/origin/base`])
    await git(['bundle', 'verify', bundle])
    await git(['fetch', '--no-tags', bundle, input.commit])
    if (await git(['cat-file', '-t', input.commit]) !== 'commit') throw new Error('CODING_GIT_COMMIT_REQUIRED')
    await git(['merge-base', input.commit, 'refs/remotes/origin/base'])
    await input.beforeWrite()
    // The trusted hook rejects any remote old OID other than zero; receive-pack then compares it atomically.
    await git(['push', '--porcelain', 'origin', `${input.commit}:refs/heads/${input.branch}`])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
