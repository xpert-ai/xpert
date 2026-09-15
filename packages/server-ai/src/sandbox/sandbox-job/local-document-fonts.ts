import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Headless LibreOffice builds on macOS may use Fontconfig instead of CoreText. */
export async function localDocumentFontEnvironment(
    workspaceRoot: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform = process.platform
): Promise<NodeJS.ProcessEnv> {
    if (platform !== 'darwin' || environment.FONTCONFIG_FILE || environment.FONTCONFIG_PATH) return environment

    const directory = path.join(workspaceRoot, 'runtime', 'fontconfig')
    const cache = path.join(directory, 'cache')
    await mkdir(cache, { recursive: true })
    const config = path.join(directory, 'fonts.conf')
    // Keep config/cache within this disposable Job; never change installed fonts
    // or the user's LibreOffice profile. Native CoreText builds ignore this file.
    const fontDirectories = ['/System/Library/Fonts', '/Library/Fonts']
    if (environment.HOME) fontDirectories.push(path.join(environment.HOME, 'Library', 'Fonts'))
    await writeFile(
        config,
        `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
${fontDirectories.map((directory) => `  <dir>${escapeXml(directory)}</dir>`).join('\n')}
  <cachedir>${escapeXml(cache)}</cachedir>
  <alias><family>宋体</family><prefer><family>Songti SC</family><family>Noto Serif CJK SC</family></prefer></alias>
  <alias><family>SimSun</family><prefer><family>Songti SC</family><family>Noto Serif CJK SC</family></prefer></alias>
</fontconfig>
`,
        'utf8'
    )
    return { ...environment, FONTCONFIG_FILE: config }
}

function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
