const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join, relative } = require('node:path')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

function withBuildProfile(config, { context }) {
  if (!process.env.API_BUILD_PROFILE_DIR) return config
  const checker = config.plugins.find((plugin) => plugin instanceof ForkTsCheckerWebpackPlugin)
  if (!checker) throw new Error('API build profiling requires the TypeScript checker')
  checker.options.typescript.profile = true
  config.plugins.push({
    apply(compiler) {
      compiler.hooks.done.tap('ApiBuildProfile', (stats) => {
        const workspaceTypeScript = [...stats.compilation.modules]
          .map((module) => module.resource)
          .filter((resource) => resource && /\.[cm]?tsx?$/.test(resource))
          .map((resource) => relative(context.root, resource).replaceAll('\\', '/'))
          .filter((resource) => resource.startsWith('packages/'))
          .sort()
        const report = {
          durationMs: stats.endTime - stats.startTime,
          modules: stats.compilation.modules.size,
          workspaceTypeScript,
          errors: stats.compilation.errors.length,
          warnings: stats.compilation.warnings.length
        }
        const file = join(context.root, process.env.API_BUILD_PROFILE_DIR, 'webpack.json')
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
        console.log(
          `[api-webpack] ${report.durationMs} ms; ${report.modules} modules; ${workspaceTypeScript.length} workspace TypeScript sources`
        )
      })
    }
  })
  return config
}

module.exports = { withBuildProfile }
