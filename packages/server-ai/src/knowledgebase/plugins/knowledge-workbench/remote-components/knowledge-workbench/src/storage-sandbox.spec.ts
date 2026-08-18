/** @jest-environment jsdom */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const remoteComponentRoot = join(__dirname, '..')
const sourcePath = join(__dirname, 'main.tsx')
const bundlePath = join(remoteComponentRoot, 'app.js')
const webStoragePropertyNames = ['local', 'session'].map((prefix) => `${prefix}Storage`)

describe('knowledge workbench sandbox compatibility', () => {
    it('keeps source and generated assets free of Web Storage access', () => {
        const source = readFileSync(sourcePath, 'utf8')
        const bundle = readFileSync(bundlePath, 'utf8')

        for (const propertyName of webStoragePropertyNames) {
            expect(source).not.toContain(propertyName)
            expect(bundle).not.toContain(propertyName)
        }
    })

    it('initializes when Web Storage property reads throw SecurityError', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
        const originalDescriptors = new Map(
            [...webStoragePropertyNames, 'React', 'ReactDOM', 'IS_REACT_ACT_ENVIRONMENT'].map((propertyName) => [
                propertyName,
                Object.getOwnPropertyDescriptor(globalThis, propertyName)
            ])
        )

        for (const propertyName of webStoragePropertyNames) {
            Object.defineProperty(window, propertyName, {
                configurable: true,
                get() {
                    throw new DOMException('Unavailable in an opaque sandbox', 'SecurityError')
                }
            })
        }
        Object.defineProperty(globalThis, 'React', { configurable: true, value: React })
        Object.defineProperty(globalThis, 'ReactDOM', {
            configurable: true,
            value: { ...ReactDOM, createRoot }
        })
        Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
            configurable: true,
            value: true
        })

        try {
            await act(async () => {
                window.eval(readFileSync(bundlePath, 'utf8'))
                await Promise.resolve()
            })

            expect(document.querySelector('main')).not.toBeNull()
            expect(consoleError.mock.calls.flat().map(String).join('\n')).not.toContain('SecurityError')
        } finally {
            for (const [propertyName, descriptor] of originalDescriptors) {
                if (descriptor) {
                    Object.defineProperty(globalThis, propertyName, descriptor)
                } else {
                    Reflect.deleteProperty(globalThis, propertyName)
                }
            }
            consoleError.mockRestore()
        }
    })
})
