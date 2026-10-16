# JSON-encoded schema inputs

Use `jsonEncodedSchema` at an input boundary that explicitly accepts either a native value or that value encoded once as JSON text. It uses `zod/v3` and preserves the supplied schema's validation and output type.

```ts
import { jsonEncodedSchema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const files = jsonEncodedSchema(z.array(z.object({ path: z.string().min(1).max(300) }).strict()).max(10), {
  maxChars: 64_000
})

files.parse([{ path: 'data/orders.csv' }])
files.parse('[{"path":"data/orders.csv"}]')
```

The helper decodes at most once. Malformed or oversized text is passed unchanged to the original schema, so use it with schemas whose native input excludes strings. Object fields, array limits, refinements, defaults and transforms continue to belong to that schema. Strings nested inside objects or arrays remain unchanged.

`maxChars` defaults to 200,000 UTF-16 code units and limits only text decoding. Bound native objects and arrays in the supplied schema. Keep domain schemas strict and wrap only the intended boundary fields; importing this helper does not change HTTP, persistence or other inputs automatically.
