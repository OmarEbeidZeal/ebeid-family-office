/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

/**
 * Loosely typed browser client for dynamic table access (generic hooks and
 * shared CRUD helpers). Row shapes are asserted at the call site.
 */
export const db = supabase as any;
