import { parse, stringify } from 'yaml'

export function saveAsYaml(fileName: string, value: unknown) {
  const link = document.createElement('a')
  const file = new Blob([stringify(value)], { type: 'text/plain' })
  link.href = URL.createObjectURL(file)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function uploadYamlFile<T>(file: File): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content !== 'string') {
        reject(new Error('Unable to read YAML file as text.'))
        return
      }
      try {
        resolve(parse(content))
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read YAML file.'))
    reader.readAsText(file, 'UTF-8')
  })
}

export async function parseYAML<T>(content: string): Promise<T> {
  return parse(content)
}
