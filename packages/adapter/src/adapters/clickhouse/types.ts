// Map your custom types to ClickHouse types
export const typeToCHDB = (type: string, isKey?: boolean, length?: number): string => {
  switch (type) {
    case 'String':
      return 'String'
    case 'Int':
      return 'Int32'
    case 'BigInt':
      return 'Int64'
    case 'Float':
      return 'Float32'
    case 'Double':
      return 'Float64'
    case 'Boolean':
      return 'UInt8'
    case 'Date':
      return 'Date'
    case 'Datetime':
      return 'DateTime'
    case 'Time':
      return 'String' // ClickHouse does not have a Time-only type
    default:
      return 'String'
  }
}
