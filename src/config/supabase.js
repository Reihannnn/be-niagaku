import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_ANON_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;