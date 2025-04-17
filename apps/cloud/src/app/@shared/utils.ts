import * as CryptoJS from 'crypto-js'

export function calculateHash(jsonString: string): string {
    return CryptoJS.SHA256(jsonString).toString(CryptoJS.enc.Hex)
}
  