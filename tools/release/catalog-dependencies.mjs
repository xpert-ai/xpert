// npm does not expand pnpm catalogs. Resolve them before publishing build outputs.
export function rewriteCatalogDependencies(manifest, workspace) {
  const rewrites = []
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) continue
      const catalogName = specifier.slice('catalog:'.length) || 'default'
      const catalog = catalogName === 'default' ? workspace.catalog : workspace.catalogs?.[catalogName]
      const version = catalog?.[name]
      if (typeof version !== 'string' || !version.trim() || /^(catalog|workspace|file|link):/.test(version)) {
        throw new Error(
          `Cannot publish ${manifest.name}: ${section}.${name} has no publishable version in ${specifier}`
        )
      }
      manifest[section][name] = version
      rewrites.push(`${section}.${name}: ${specifier} -> ${version}`)
    }
  }
  return rewrites
}
