# Supabase setup for FUN

## 1. Run the schema (required)

The app needs tables and RPCs in your Supabase project.

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project.
2. Go to **SQL Editor** → **New query**.
3. Copy the **entire contents** of `supabase/schema.sql` (in the FUN repo) and paste into the editor.
4. Click **Run** (not "Explain"). If prompted about "destructive operations", confirm — the script is safe to re-run.
5. You should see **"Success. No rows returned."** Refresh the app; games and map should work.

## 2. Enable Anonymous auth (required for create/join)

Without this, you'll get **422** or **"Anonymous sign-ins are disabled"** when creating a game or joining one.

1. In the Supabase Dashboard go to **Authentication** → **Providers**.
2. Find **Anonymous** and open it.
3. Turn **Enable Anonymous Sign-Ins** **ON**.
4. Save.

After this, the app can sign you in anonymously so you can create games, join games, and appear on the map for other players — no email signup needed.
