import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'

const requireHere = createRequire(__filename)

export async function projectRemoteEntry(component: string, title: string) {
    // tsc/source retain the module tree; the bundled API copies assets beside main.js.
    const moduleRoot = join(__dirname, '..', 'remote-components', component)
    const root = existsSync(join(moduleRoot, 'app.js'))
        ? moduleRoot
        : join(__dirname, 'remote-components', component)
    const packageFile = (name: string, file: string) =>
        readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
        readFile(join(root, 'app.js'), 'utf8'),
        readFile(join(root, 'app.css'), 'utf8'),
        packageFile('react', 'umd/react.production.min.js'),
        packageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
        html: renderRemoteReactIframeHtml({ title, appScript, appCss, reactUmd, reactDomUmd }),
        contentType: 'text/html; charset=utf-8' as const
    }
}
