// pnpm links this workspace package through publishConfig.directory. Export
// targets must be relative to dist and include only the entries built here.
export function desktopContractsManifest(manifest) {
  return {
    ...manifest,
    types: './index.d.ts',
    exports: {
      '.': { types: './index.d.ts', module: './index.esm.js', default: './index.cjs.js' },
      './package.json': './package.json'
    }
  }
}
