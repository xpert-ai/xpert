/* xpert-migration
{
  "phase": "before-sync"
}
*/
-- Checksum-pinned grant migrations use uuid_generate_v4(). Install their prerequisite
-- before they run, including on fresh databases that only have pgcrypto.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
