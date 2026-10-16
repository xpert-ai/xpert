// Invariants: bundling and type checking must resolve the same built libraries.
// Nx 22 remaps the resolver later, after constructing its loader and checker.
// Generate their shared config first; dependency builds remain in the Nx graph.
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { calculateProjectBuildableDependencies, createTmpTsConfig } = require('@nx/js/src/utils/buildable-libs-utils')

function withBuiltLibraries(config, { options, context }) {
  if (options.buildLibsFromSource !== false) return config
  const { target, dependencies, nonBuildableDependencies } = calculateProjectBuildableDependencies(
    undefined,
    context.projectGraph,
    context.root,
    context.projectName,
    'build',
    context.configurationName
  )
  options.tsConfig = createTmpTsConfig(options.tsConfig, context.root, target.data.root, dependencies)
  // Direct-JS workspaces have no build target. Relocated library output no longer
  // sees their package-local pnpm links, so resolve their declared package roots.
  const generated = JSON.parse(readFileSync(options.tsConfig, 'utf8'))
  for (const name of nonBuildableDependencies) {
    const projectRoot = context.projectGraph.nodes[name].data.root
    const manifest = join(context.root, projectRoot, 'package.json')
    if (!existsSync(manifest)) continue
    const { name: packageName } = JSON.parse(readFileSync(manifest, 'utf8'))
    if (packageName) generated.compilerOptions.paths[packageName] ??= [projectRoot]
  }
  writeFileSync(options.tsConfig, JSON.stringify(generated))
  return config
}

module.exports = { withBuiltLibraries }
