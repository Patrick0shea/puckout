/*
 * Shared leaderboard settings. Leave blank to play without one: the
 * leaderboard then shows only the roads played on this device.
 *
 * To switch it on, create a free Supabase project, run supabase/schema.sql
 * in its SQL editor, then paste the project URL and the publishable (or "anon public") key
 * (Project Settings → API) below. The anon key is meant to be public; the
 * database rules in schema.sql only allow reading the board and adding roads.
 */
window.PuckoutConfig = {
  supabaseUrl: "https://oqwrunaxwyhtsnpvjmil.supabase.co",
  supabaseAnonKey: "sb_publishable_m5sQklITspOciRik5LRRNw_I156op2b"
};
