import './polyfills';
// import { installPlugins } from '@metad/server-core';
import { bootstrap } from './bootstrap/index'
import { prepare } from './core/prepare'

prepare()

// installPlugins()

bootstrap({
    title: 'Xpert AI Debug',
    version: '1.0'
}).catch((err) => {
    console.error('Error during Analytics bootstrap:', err)
    process.exit(1)
})
