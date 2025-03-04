import './polyfills';
import { bootstrap } from './bootstrap/index'
import { prepare } from './core/prepare'

prepare()

bootstrap({
    title: 'Xpert AI Debug',
    version: '1.0'
})
