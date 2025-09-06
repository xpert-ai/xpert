import { Inject, OnModuleDestroy } from '@nestjs/common';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import {
  Observable,
  Subject,
  merge as ObservableMerge,
  from as ObservableFrom,
} from 'rxjs';
import chokidar from 'chokidar';
import { switchMap } from 'rxjs/operators';
import { I18N_LOADER_OPTIONS, I18nLoader, I18nTranslation } from 'nestjs-i18n';
const readFile = promisify(fs.readFile);
const exists = promisify(fs.exists);
const readdir = promisify(fs.readdir);
const lstat = promisify(fs.lstat);

export interface I18nJsonParserOptions {
  paths: string[];  // Updated to support multiple paths
  filePattern?: string;
  watch?: boolean;
}

const defaultOptions: Partial<I18nJsonParserOptions> = {
  filePattern: '*.json',
  watch: false,
};

export class I18nJsonParser extends I18nLoader implements OnModuleDestroy {

  private watcher?: chokidar.FSWatcher;

  private events: Subject<string> = new Subject();

  constructor(
    @Inject(I18N_LOADER_OPTIONS)
    private options: I18nJsonParserOptions,
  ) {
    super();
    this.options = this.sanitizeOptions(options);

    if (this.options.watch) {
      this.watcher = chokidar
        .watch(this.options.paths, { ignoreInitial: true })  // Watch multiple paths
        .on('all', (event) => {
          this.events.next(event);
        });
    }
  }

  async onModuleDestroy() {
    if (this.watcher) {
      await this.watcher.close();
    }
  }

  async languages(): Promise<string[] | Observable<string[]>> {
    if (this.options.watch) {
      return ObservableMerge(
        ObservableFrom(this.aggregateLanguages()),
        this.events.pipe(switchMap(() => this.aggregateLanguages())),
      );
    }
    return this.aggregateLanguages();
  }

  private async aggregateLanguages(): Promise<string[]> {
    const languageSets = await Promise.all(
      this.options.paths.map((p) => this.parseLanguages(p)),
    );
  
    // 合并去重
    return Array.from(new Set(languageSets.flat()));
  }

  async load(): Promise<I18nTranslation | Observable<I18nTranslation>> {
    if (this.options.watch) {
      return ObservableMerge(
        ObservableFrom(this.parseTranslations()),
        this.events.pipe(switchMap(() => this.parseTranslations())),
      );
    }
    return this.parseTranslations();
  }

  private async parseTranslations(): Promise<I18nTranslation> {
    const translations: I18nTranslation = {};

    const paths = this.options.paths.map((i18nPath) => path.normalize(i18nPath + path.sep));

    for (const i18nPath of paths) {
      if (!(await exists(i18nPath))) {
        throw new Error(`i18n path (${i18nPath}) cannot be found`);
      }

      if (!this.options.filePattern.match(/\*\.[A-z]+/)) {
        throw new Error(
          `filePattern should be formatted like: *.json, *.txt, *.custom etc`,
        );
      }

      const languages = await this.parseLanguages(i18nPath);

      const pattern = new RegExp(
        '.' + this.options.filePattern.replace('.', '.'),
      );

      const files = await [
        ...languages.map((l) => path.join(i18nPath, l)),
        i18nPath,
      ].reduce(async (f: Promise<string[]>, p: string) => {
        (await f).push(...(await getFiles(p, pattern)));
        return f;
      }, Promise.resolve([]));

      for (const file of files) {
        let global = false;

        const key = path
          .dirname(path.relative(i18nPath, file))
          .split(path.sep)[0];

        if (key === '.') {
          global = true;
        }

        const data = JSON.parse(await readFile(file, 'utf8'));

        const prefix = path.basename(file).split('.')[0];

        for (const property of Object.keys(data)) {
          [...(global ? languages : [key])].forEach((lang) => {
            translations[lang] = translations[lang] ? translations[lang] : {};

            if (global) {
              translations[lang][property] = data[property];
            } else {
              translations[lang][prefix] = translations[lang][prefix]
                ? translations[lang][prefix]
                : {};

              translations[lang][prefix][property] = data[property];
            }
          });
        }
      }
    }

    return translations;
  }

  private async parseLanguages(i18nPath: string): Promise<string[]> {
    return (await getDirectories(i18nPath)).map((dir) =>
      path.relative(i18nPath, dir),
    );
  }

  private sanitizeOptions(options: I18nJsonParserOptions) {
    options = { ...defaultOptions, ...options };

    options.paths = options.paths.map((p) => path.normalize(p + path.sep)); // Normalize all paths
    if (!options.filePattern.startsWith('*.')) {
      options.filePattern = '*.' + options.filePattern;
    }

    return options;
  }
}

export const getDirectories = async (source: string) => {
  const dirs = await readdir(source);
  return filterAsync(
    dirs.map(name => path.join(source, name)),
    isDirectory,
  );
};

export async function filterAsync<T>(
  array: T[],
  callbackfn: (value: T, index: number, array: T[]) => Promise<boolean>,
): Promise<T[]> {
  const filterMap = await mapAsync(array, callbackfn);
  return array.filter((value, index) => filterMap[index]);
}

export function mapAsync<T, U>(
  array: T[],
  callbackfn: (value: T, index: number, array: T[]) => Promise<U>,
): Promise<U[]> {
  return Promise.all(array.map(callbackfn));
}

export const isDirectory = async (source: string) =>
  (await lstat(source)).isDirectory();

export const getFiles = async (dirPath: string, pattern: RegExp) => {
  const dirs = await readdir(dirPath, { withFileTypes: true });

  return (
    await filterAsync(dirs, async (f: fs.Dirent | string) => {
      try {
        if (typeof f === 'string') {
          return (await exists(path.join(dirPath, f))) && pattern.test(f);
        } else {
          return f.isFile() && pattern.test(f.name);
        }
      } catch {
        return false;
      }
    })
  ).map(f => path.join(dirPath, typeof f === 'string' ? f : f.name));
};