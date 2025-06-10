import { get, set } from 'money-clip'
import { clear, del, keys, UseStore } from 'idb-keyval'
import { OcapCache, OcapCacheOptions } from './types'

/**
 * Cache decorator options (IndexedDB)
 */
export interface CacheOptions {
  /**
   * The version of the cache, default is 1
   */
  version?: number;
  /**
   * The maximum age of the cache, in milliseconds
   */
  maxAge: number;
  /**
   * The priority of the cache, the higher the priority, the lower the level
   */
  level: number
}

const CACHE_OPTIONS = {level: 0}

export const serializeArgs = (...args: unknown[]) => args.map((arg: unknown) => arg.toString()).join(':')

/**
 * Cache decorator (store in IndexedDB), use [money-clip](https://www.npmjs.com/package/money-clip) lib:
 * 
 * Example:
  ```typescript
  @Cache('xmla-mdx:', { maxAge: 1000 * 60 * 60, level: 3 })
  async execute(modelName: string, mdx: string, language = '', options: { skip: boolean | void }): Promise<any> {
  }
  ```
 * 
 * @param key 
 * @param param1 
 * @returns 
 */
export function Cache(key: string, {maxAge, level}: CacheOptions) {
  const cacheOptions: CacheOptions = {
    version: 1,
    maxAge,
    level
  }

  return function (_: unknown, __: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = function (...args) {
      if (isBrowser()) {
        const options = typeof args[args.length - 1] === 'object' ? args[args.length - 1] : null
        const cacheKey = options ? serializeArgs(key, ...args.slice(0, args.length - 1)) : serializeArgs(key, ...args)
        
        if (cacheOptions.level <= CACHE_OPTIONS.level) {
          if (!options?.skip) {
            return get(cacheKey, cacheOptions).then((data) => {
              if (data) {
                return data
              }
      
              return method.apply(this, args).then(
                (result: unknown) => {
                  if (result) {
                    set(cacheKey, result, cacheOptions)
                  }
                  return result
                }
              )
            })
          } else {
            return method.apply(this, args).then(
              (result: unknown) => {
                if (result) {
                  set(cacheKey, result, cacheOptions)
                }
                return result
            })
          }
        }
      }

      return method.apply(this, args)
    }
  }
}

/**
 * Cache service, manage cache using [idb-keyval](https://www.npmjs.com/package/idb-keyval) lib:
 * 
 * 1. clear all cache
 * 2. change cache level
 * 3. get cache keys
 * 4. clear cache by key
 */
export class DSCacheService implements OcapCache {
  options = {
    maxAge: 1000 * 60 * 60,
    level: -1
  }

  constructor(options?: CacheOptions) {
    this.options = options ?? this.options
  }

  clearAllCache(): void {
    clear()
  }

  changeCacheLevel(level: number): void {
    CACHE_OPTIONS.level = level
    this.options.level = level
  }

  getCacheLevel() {
    return CACHE_OPTIONS.level
  }

  async getCache({key: cacheKey, level, version, maxAge}: OcapCacheOptions, {skip}: {skip?: boolean | void}= {}) {
    if (level <= this.options.level) {
      if (!skip) {
        return get(cacheKey, {version, maxAge})
      }
    }

    return null
  }

  setCache({key, level, version, maxAge}: OcapCacheOptions, data: unknown): void {
    if (data && level <= this.options.level) {
      set(key, data, {version, maxAge})
    }
  }

  async keys(customStore?: UseStore):  Promise<string[]> {
    return keys(customStore)
  }

  async clear(key: IDBValidKey, customStore?: UseStore): Promise<void> {
    return del(key, customStore)
  }
}

export function isBrowser() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}