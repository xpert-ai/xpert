export function pick<T, K extends keyof T>(object: T, ...keys: Array<K | K[]>) {
  return (
    object &&
    (keys?.reduce((obj, key) => {
      return (Array.isArray(key) ? key : [key]).reduce((obj, key) => {
        if (object && Object.prototype.hasOwnProperty.call(object, key)) {
          obj[key] = object[key]
        }
        return obj
      }, obj)
    }, {} as Record<K, any>) ?? {} as T)
  )
}
