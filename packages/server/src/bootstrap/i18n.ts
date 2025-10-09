import { LanguagesEnum } from '@metad/contracts'
import { environment } from '@metad/server-config'
import { HeaderResolver, I18nModule } from 'nestjs-i18n'
import path from 'path'
import glob from 'glob'
import { I18nJsonParser } from './i18n-parser'

export function provideI18nModule(baseDir: string) {
    console.log('I18nModule', baseDir)
    return I18nModule.forRoot({
        fallbackLanguage: LanguagesEnum.English,
        loader: I18nJsonParser,
        loaderOptions: {
            paths: resolveTranslationPaths(baseDir),
            watch: !environment.production
        },
        resolvers: [new HeaderResolver(['language'])]
    })
}

export function resolveTranslationPaths(baseDir: string) {
  // Find the i18n/** directory under all modules
  const matches = glob.sync(path.join(baseDir, 'packages', '**/i18n/'));

  // If you build with nest-cli, this returns the actual path to the dist directory
  return matches;
}
