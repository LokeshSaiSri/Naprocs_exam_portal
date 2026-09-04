// Replaces mongoose.Types.ObjectId.isValid() checks now that IDs are uuid
// (Rulebook rule #3: IDs stay opaque strings, just uuid instead of ObjectId).
export const isValidUUID = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
