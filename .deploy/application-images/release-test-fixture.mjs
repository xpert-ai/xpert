import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { services } from './services.mjs'
import { releasePlan } from './release-plan.mjs'
const [api, web, jail] = services
const contracts = '@xpert-ai/contracts'
export function fixture(t, { legacy = false, retainedChangesetPolicy } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'application-images-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), content)
  }
  const version = (service, value) =>
    write(service.manifest, JSON.stringify({ name: service.name, private: true, version: value }))
  const note = (id, names = [api.name], type = 'patch') =>
    write(
      `.changeset/${id}.md`,
      `---\n${names.map((name) => `'${name}': ${type}`).join('\n')}\n---\nPublish the requested images.\n`
    )
  const remove = (id) => rmSync(path.join(cwd, `.changeset/${id}.md`))
  const commit = () => {
    git('add', '.')
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Release tests',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture'
    )
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q')
  for (const service of services) if (!legacy || service !== jail) version(service, '1.0.0')
  for (const file of new Set(services.flatMap((service) => service.shared))) {
    const { name } = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    write(file, JSON.stringify({ name, version: '1.0.0' }))
  }
  write('.changeset/config.json', JSON.stringify({ privatePackages: { version: true } }))
  const initial = commit()
  const plan = (before, after, event = 'push', ref = 'refs/heads/develop', mainSha) =>
    releasePlan({ cwd, before, after, event, ref, mainSha, retainedChangesetPolicy })
  return { cwd, git, write, version, note, remove, commit, initial, plan }
}
export const tags = (image) => image.tags.split('\n').map((tag) => tag.replace('type=raw,value=', ''))

export function mainSyncFixture(t) {
  const f = fixture(t)
  f.note('released', [api.name, web.name, contracts], 'minor')
  const fork = f.commit()
  f.remove('released')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.1.0' }))
  f.commit()
  // Main may contain multiple releases or an intentional version baseline alignment.
  f.version(api, '1.11.0')
  const main = f.commit()
  f.git('checkout', '--detach', fork)
  f.note('downstream', [api.name, web.name])
  const before = f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Release tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-qm',
    'Sync main',
    main
  )
  const after = f.git('rev-parse', 'HEAD')
  return { ...f, main, before, after }
}
