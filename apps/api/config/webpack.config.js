const { composePlugins, withNx } = require('@nx/webpack')
const { withBuiltLibraries } = require('./buildable-libraries.cjs')
const { withBuildProfile } = require('./build-profile.cjs')

console.log('Using custom Webpack Config -> __dirname: ' + __dirname)
console.log('Using custom Webpack Config -> process.cwd: ' + process.cwd())

// Nx plugins for webpack.
module.exports = composePlugins(
  withBuiltLibraries,
  withNx({
    target: 'node' // Target for Node.js
  }),
  (config) => {
    // Nx's default TypeScript rule omits .cts, which the shared CommonJS brand catalog uses.
    const tsRule = config.module.rules.find((rule) => rule.loader === require.resolve('ts-loader'))
    if (!tsRule) throw new Error('The API webpack build requires the Nx TypeScript loader')
    tsRule.test = [tsRule.test, /\.cts$/]
    // Watch options
    config.watchOptions = {
      ignored: ['**/node_modules/**', '**/dist/**', '**/public/**/*'], // Ignore unnecessary folders
      aggregateTimeout: 300, // Delay rebuild slightly
      poll: false // Disable polling
    }
    return config
  },
  withBuildProfile
)
