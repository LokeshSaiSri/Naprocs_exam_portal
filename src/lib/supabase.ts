import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service_role key — same trust level as the
// direct Mongoose connection it replaces (full access, no RLS). Never import
// this from a "use client" component; it must only run in route handlers.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Please define SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables inside .env"
  );
}

declare global {
  // eslint-disable-next-line no-var
  var supabaseClientCache: SupabaseClient | undefined;
}

// Cache across hot-reloads in dev (mirrors the singleton-cache pattern used
// for the old Mongoose client, since removed post-Supabase-migration) —
// avoids spinning up a new client on every module reload.
const supabase =
  global.supabaseClientCache ??
  createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

if (process.env.NODE_ENV !== "production") {
  global.supabaseClientCache = supabase;
}

export default supabase;
