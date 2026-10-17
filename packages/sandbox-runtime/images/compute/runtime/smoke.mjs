import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

assert.equal(process.versions.node.split('.')[0], '20', 'Compute requires Node 20')
const result = execFileSync(
  'python3',
  [
    '-I',
    '-c',
    `
import csv, io, json, sys
from decimal import Decimal
assert sys.version_info[:2] == (3, 12), 'Compute requires Python 3.12'
rows = list(csv.DictReader(io.StringIO('amount\\n0.10\\n0.20\\n')))
print(json.dumps({'total': str(sum(Decimal(row['amount']) for row in rows))}))
`
  ],
  { encoding: 'utf8', timeout: 10_000 }
)
assert.deepEqual(JSON.parse(result), { total: '0.30' })
process.stdout.write('verified offline Node/Python computation\n')
