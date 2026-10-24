// Resolve once for every build profile. Temporary exact catalogs prevent separate
// installs from selecting different releases; source ranges remain unchanged.
import assert from 'node:assert/strict'
import semver from 'semver'
import { parse } from 'yaml'

export const chatkitPackages = ['angular', 'types', 'ui', 'web-component', 'web-shared'].map(
  (name) => `@xpert-ai/chatkit-${name}`
)

export function selectVersions(catalog, published) {
  return Object.fromEntries(
    chatkitPackages.map((name) => {
      const range = catalog?.[name]
      assert.ok(typeof range === 'string' && semver.validRange(range), `Missing ChatKit range: ${name}`)
      const versions = published[name]
      assert.ok(Array.isArray(versions), `Invalid registry versions: ${name}`)
      const version = semver.maxSatisfying(
        versions.filter((v) => semver.valid(v) && !semver.prerelease(v)),
        range
      )
      assert.ok(version, `No stable release satisfies ${name}@${range}`)
      return [name, version]
    })
  )
}

export function validateCompatibility(versions, metadata) {
  for (const [name, version] of Object.entries(versions)) {
    const pkg = metadata[name]
    assert.equal(pkg?.name, name, 'Unexpected registry package')
    assert.equal(pkg.version, version, `Unexpected registry version: ${name}`)
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dependency, range] of Object.entries(pkg[section] ?? {})) {
        if (!Object.hasOwn(versions, dependency)) continue
        assert.ok(
          semver.validRange(range) && semver.satisfies(versions[dependency], range),
          `${name}@${version} requires ${dependency}@${range}, selected ${versions[dependency]}`
        )
      }
    }
  }
}

export function validateLock(content, catalog, versions, expectedNames) {
  const lock = parse(content)
  for (const name of expectedNames) {
    assert.equal(lock.catalogs?.default?.[name]?.specifier, catalog[name], `Catalog changed in lock: ${name}`)
    assert.equal(lock.catalogs.default[name].version, versions[name], `Profile version mismatch: ${name}`)
  }
  // Check transitive snapshots too: aligned catalogs alone do not rule out a
  // second incompatible copy embedded by another ChatKit package.
  for (const key of Object.keys(lock.packages ?? {})) {
    for (const name of chatkitPackages) {
      if (!key.startsWith(`${name}@`)) continue
      assert.equal(key.slice(name.length + 1).split('(')[0], versions[name], `Duplicate ChatKit version: ${key}`)
    }
  }
}
