const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

module.exports = (config) => ({
  ...config,
  plugins: [
    ...config.plugins,
    {
      name: 'pipeline-strict-declarations',
      writeBundle() {
        // The legacy package disables strictNullChecks. Zod declarations emitted with that
        // setting make required fields optional in strict plugin consumers. Compile the new
        // self-contained schema surface strictly without changing unrelated legacy contracts.
        const result = spawnSync(
          process.execPath,
          [require.resolve('typescript/bin/tsc'), '-p', resolve(__dirname, 'tsconfig.pipeline.json')],
          { encoding: 'utf8' }
        )
        if (result.status !== 0) this.error(result.stderr || result.stdout || 'Pipeline declaration build failed')
      }
    }
  ]
})
