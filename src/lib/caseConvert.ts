// SHALLOW camelCase <-> snake_case conversion of table-ROW keys only.
//
// Why this exists: Postgres/Supabase convention is snake_case columns, but
// Rulebook rule #1 (SUPABASE_MIGRATION.md) requires every API route's JSON
// contract to stay byte-identical to the old Mongoose camelCase shape.
// Every ported route should run outgoing rows through toCamelCase() and
// incoming request bodies through toSnakeCase() before hitting Supabase.
//
// IMPORTANT: this is deliberately SHALLOW -- it converts only a row's own
// top-level column-name keys, and never recurses into a column's VALUE (a
// JSONB blob like `test_cases` or `responses`). Those are opaque payloads
// whose internal keys (expectedOutput, isHidden, selectedOption, ...) must be
// stored and read back exactly as authored -- a prior deep-recursion version
// of this file silently mangled `testCases[]` internals to snake_case at
// insert time (expectedOutput -> expected_output), which broke every route
// that read `test_cases` directly instead of through toCamelCase (exam/submit,
// exam/evaluate), causing every grading comparison to fail silently. Found
// and fixed during Step 7 verification -- see SUPABASE_MIGRATION.md.

// Postgres primary key columns are named `id`; the original Mongoose contract
// (and all 14 frontend/route files that read `._id`) expects `_id`. Special-case
// exact matches so every ported route's `id` <-> `_id` round-trips automatically
// via toCamelCase/toSnakeCase, without needing to special-case it in every route.
const toSnakeKey = (s: string) =>
  s === "_id" ? "id" : s.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const toCamelKey = (s: string) =>
  s === "id" ? "_id" : s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function convertRowKeys(row: any, convertKey: (s: string) => string): any {
  if (row === null || typeof row !== "object" || row instanceof Date) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [convertKey(key), value]));
}

function convertRows(input: any, convertKey: (s: string) => string): any {
  if (Array.isArray(input)) return input.map((row) => convertRowKeys(row, convertKey));
  return convertRowKeys(input, convertKey);
}

export const toSnakeCase = (obj: any) => convertRows(obj, toSnakeKey);
export const toCamelCase = (obj: any) => convertRows(obj, toCamelKey);
