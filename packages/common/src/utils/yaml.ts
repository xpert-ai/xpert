import * as fs from 'fs'
import * as yaml from 'yaml'

export async function readYamlFile<T>(fileName: string,) {
    try {
        const data = await fs.promises.readFile(fileName, 'utf8')
        return yaml.parse(data) as T
    } catch (err) {
        console.error(err)
        return null
    }
}

export { yaml }