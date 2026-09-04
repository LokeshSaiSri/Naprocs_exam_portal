// PostgREST/Supabase quirk: in a multi-row insert, if rows have different key
// sets, a key that's missing on *some* rows becomes an explicit `null` for
// those rows instead of falling through to the column's DEFAULT -- unlike
// Mongoose, which applied schema defaults per-document regardless of batch
// shape. Fill defaults explicitly before inserting so behavior matches what
// Mongoose did (see SUPABASE_MIGRATION.md, discovered during Question testing).
export const withDefaults = <T extends object>(item: T, defaults: Partial<T>): T => ({
  ...defaults,
  ...item,
});
