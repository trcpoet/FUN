# Row Level Security (RLS) — Complete Guide

## What is RLS and Why Do We Need It?

### The Problem Without RLS

Imagine you have a users table with passwords:

```sql
CREATE TABLE public.users (
  id uuid primary key,
  email text,
  password_hash text,
  secret_api_key text
);

-- Anyone with a Supabase key can do:
SELECT * FROM public.users;  -- Returns ALL users' passwords!

-- Or delete anyone's account:
DELETE FROM public.users WHERE id = 'some-random-uuid';
```

**Without RLS, every authenticated user can see and modify every row.**

### The Solution: RLS

With RLS enabled:

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Without a policy, no one can read or write
SELECT * FROM public.users;  -- Returns 0 rows (denied)

-- Create a policy: "Users can only see themselves"
CREATE POLICY "Users can read own profile"
ON public.users
FOR SELECT
USING (id = auth.uid());

-- Now:
SELECT * FROM public.users;  -- Returns only the current user's row
```

---

## How RLS Works (Under the Hood)

### The Magic Function: `auth.uid()`

This function returns the **UUID of the currently logged-in user**:

```sql
-- In an API request from user-123:
SELECT auth.uid();  -- Returns: 'user-123'

-- In an API request from user-456:
SELECT auth.uid();  -- Returns: 'user-456'

-- In a request with no auth token:
SELECT auth.uid();  -- Returns: NULL
```

This is how Postgres knows "who is asking?"

### Policy Evaluation

When a user tries to query a table with RLS enabled:

```
User requests:  SELECT * FROM games;

PostgreSQL checks:
  1. Is RLS enabled on games table? YES
  2. Does a SELECT policy exist? YES
  3. Is the USING clause true for this row?
     - Row 1: "Authenticated users can create games" → auth.role() = 'authenticated' → TRUE
     - Row 2: Same → TRUE
     - Row 3: Same → TRUE
  4. Return all rows where USING = TRUE
```

Result: User sees all rows (assuming they match the policy).

### Example: Game Permissions

```sql
-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can see all games
CREATE POLICY "Games are viewable by everyone"
ON public.games
FOR SELECT
USING (true);  -- ← "true" = no filtering

-- Result: SELECT * FROM games; → returns ALL games
```

```sql
-- Policy 2: Only the host can delete their game
CREATE POLICY "Hosts can delete own games"
ON public.games
FOR DELETE
USING (auth.uid() = created_by);  -- ← "true" only for own games

-- If user-123 tries to delete a game created by user-456:
DELETE FROM games WHERE id = 'game-xyz';

-- PostgreSQL checks USING clause:
-- auth.uid() = created_by
-- 'user-123' = 'user-456'  → FALSE
-- → DELETE denied, no rows deleted
```

---

## RLS Policy Syntax

### Structure

```sql
CREATE POLICY <name>
ON <table>
FOR <operation>
[USING (<expression>)]      -- For SELECT, UPDATE (read side), DELETE
[WITH CHECK (<expression>)]; -- For INSERT, UPDATE (write side)
```

### Operations

| Operation | When Used | Clause |
|-----------|-----------|--------|
| SELECT | Reading rows | `USING` |
| INSERT | Writing new rows | `WITH CHECK` |
| UPDATE | Modifying existing rows | `USING` (old row) + `WITH CHECK` (new row) |
| DELETE | Removing rows | `USING` |

### Examples

#### 1. SELECT: Only read your own data

```sql
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
USING (id = auth.uid());

-- User-123 queries:
SELECT * FROM profiles;

-- Postgres adds filter automatically:
SELECT * FROM profiles WHERE id = 'user-123';
```

#### 2. INSERT: Only create as yourself

```sql
CREATE POLICY "Users can only create own messages"
ON public.direct_messages
FOR INSERT
WITH CHECK (sender_id = auth.uid());

-- User-123 tries:
INSERT INTO direct_messages (sender_id, recipient_id, text)
VALUES ('user-456', 'user-789', 'Hello');
-- ↑ sender_id = 'user-456' but auth.uid() = 'user-123'
-- ↑ WITH CHECK fails → INSERT denied
```

#### 3. UPDATE: Only modify your own rows

```sql
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())  -- ← Can only UPDATE rows where id = current user
WITH CHECK (id = auth.uid());  -- ← AND can only SET id to current user

-- User-123 tries to change User-456's name:
UPDATE profiles SET display_name = 'Hacker' WHERE id = 'user-456';
-- USING clause: 'user-456' = 'user-123' → FALSE
-- UPDATE denied
```

#### 4. DELETE: Only delete your own rows

```sql
CREATE POLICY "Hosts can delete own games"
ON public.games
FOR DELETE
USING (created_by = auth.uid());

-- User-123 (not the host) tries to delete the game:
DELETE FROM games WHERE id = 'game-xyz';
-- USING clause: created_by = 'user-456', auth.uid() = 'user-123'
-- 'user-456' = 'user-123' → FALSE
-- DELETE denied
```

---

## RLS in FUN's Database

### Current RLS Setup

**File**: `supabase/schema.sql` and migrations

#### profiles table

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can read all profiles (public athlete directory)
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);

-- Policy 2: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Result:
-- - Any user can see any profile (good for discovery)
-- - But can only modify their own profile (no hacking others)
```

#### games table

```sql
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can see all games
CREATE POLICY "Games are viewable by everyone"
ON public.games
FOR SELECT
USING (true);

-- Policy 2: Authenticated users can create games
CREATE POLICY "Authenticated users can create games"
ON public.games
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Policy 3: Only host can delete their own game
CREATE POLICY "Hosts can delete own games"
ON public.games
FOR DELETE
USING (auth.uid() = created_by);

-- Result:
-- - Any user can see all games (good for map)
-- - Authenticated users can create games (logged-in only)
-- - Only the host can delete their game (protect from hijacking)
```

#### game_participants table

```sql
ALTER TABLE public.game_participants ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can see who joined which game
CREATE POLICY "Participants are viewable by everyone"
ON public.game_participants
FOR SELECT
USING (true);

-- Policy 2: Authenticated users can join games
CREATE POLICY "Authenticated users can join games"
ON public.game_participants
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Result:
-- - Roster is public (you can see who's in)
-- - Anyone logged in can join (via our join_game RPC)
-- - But they can't manipulate the participant table directly
```

**Important**: The insert policy doesn't check `user_id = auth.uid()` because our RPC handles that. The policy just checks "are you authenticated?"

#### profile_locations table

```sql
ALTER TABLE public.profile_locations ENABLE ROW LEVEL SECURITY;

-- Everyone can see where other players are (location sharing)
CREATE POLICY "Profile locations viewable by everyone"
ON public.profile_locations
FOR SELECT
USING (true);

-- Users can set their own location
CREATE POLICY "Users can update own profile location"
ON public.profile_locations
FOR UPDATE
USING (auth.uid() = profile_id);

-- Result:
-- - The map can show all nearby players
-- - But you can only update your own location
```

---

## RLS + RPC: A Powerful Combination

### Why RPCs matter with RLS

**Without an RPC** (direct table access):

```typescript
// In React, calling Supabase directly:
await supabase.from("game_participants").insert({
  game_id: gameId,
  user_id: auth.uid(),  // ← Can be manipulated by hacker
  role: "player",
});

// Hacker could modify the request:
await supabase.from("game_participants").insert({
  game_id: gameId,
  user_id: "user-456",  // ← Not me!
  role: "admin",  // ← Give myself privileges!
});
```

**RLS would catch this**:
```sql
-- Assume RLS policy exists:
CREATE POLICY "Users can only join as themselves"
ON public.game_participants
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Hacker's request to insert user-456:
INSERT INTO game_participants (game_id, user_id, role)
VALUES ('game-id', 'user-456', 'admin');

-- PostgreSQL checks WITH CHECK:
-- user_id = auth.uid()
-- 'user-456' = 'user-123'  (hacker's ID)
-- FALSE → INSERT DENIED
```

**With an RPC** (safer):

```sql
-- Server-side function (runs on server, not client)
CREATE FUNCTION join_game(p_game_id uuid)
RETURNS jsonb
SECURITY DEFINER  -- ← Run with elevated privileges
AS $$
BEGIN
  -- Inside the function, auth.uid() is the authenticated user
  INSERT INTO game_participants (game_id, user_id)
  VALUES (p_game_id, auth.uid());  -- ← Always current user
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
```

**Why this is safer**:
1. User calls `supabase.rpc('join_game', { p_game_id: ... })`
2. The RPC function runs **on the server**, not the client
3. The RPC uses `auth.uid()` which **can't be spoofed** by the client
4. The user_id is always the authenticated user, no way to trick it

### SECURITY DEFINER

```sql
CREATE FUNCTION join_game(p_game_id uuid)
RETURNS jsonb
SECURITY DEFINER  -- ← Run with elevated privileges
SET search_path = public
AS $$
```

**What does `SECURITY DEFINER` mean?**

- `SECURITY INVOKER` (default): Function runs with the caller's privileges
  - If user can't access a table, function can't access it either
  - Safer but more limited

- `SECURITY DEFINER`: Function runs with the owner's (Postgres role) privileges
  - Function can access tables even if user normally can't
  - But `auth.uid()` still reflects the actual user
  - This is what we want for privileged operations

**Example**:
```sql
-- Game_results table might have RLS that prevents direct inserts
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

-- But our complete_game RPC needs to insert into it
CREATE FUNCTION complete_game(...)
RETURNS void
SECURITY DEFINER  -- ← Allows access despite RLS
SET search_path = public
AS $$
BEGIN
  INSERT INTO game_results (game_id, winner)
  VALUES (p_game_id, p_winner);  -- ← Works even with restrictive RLS
END;
$$;
```

---

## Common RLS Patterns in FUN

### Pattern 1: Public Read, Authenticated Write

```sql
-- Games are readable by everyone (for map discovery)
CREATE POLICY "Games are viewable by everyone"
ON public.games
FOR SELECT
USING (true);

-- But only authenticated users can create
CREATE POLICY "Authenticated users can create games"
ON public.games
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
```

### Pattern 2: Public Read, Owner Write

```sql
-- Profiles readable by everyone (athlete discovery)
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);

-- But users can only edit their own
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);
```

### Pattern 3: Owner Read/Write Only

```sql
-- Direct messages: only sender and recipient can see
CREATE POLICY "Users can see own messages"
ON public.direct_messages
FOR SELECT
USING (
  sender_id = auth.uid() OR
  recipient_id = auth.uid()
);
```

### Pattern 4: RPC Bypasses RLS

```sql
-- Some operations are too complex for direct table access
-- So we use a SECURITY DEFINER RPC that handles permissions internally

CREATE FUNCTION complete_game(p_game_id uuid)
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Only the host can complete their game
  IF NOT EXISTS (
    SELECT 1 FROM games
    WHERE id = p_game_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the host can complete this game';
  END IF;

  UPDATE games SET status = 'completed' WHERE id = p_game_id;
  -- ... more logic ...
END;
$$ LANGUAGE plpgsql;
```

---

## How Supabase Enforces RLS

### The Flow

```
Browser (React App)
    ↓
    | (HTTPS request with JWT token)
    ↓
PostgREST API Gateway
    ↓ (Extracts JWT)
    ├─ Identifies user from JWT
    ├─ Sets auth.uid() in PostgreSQL session
    ↓
PostgreSQL Database
    ├─ Receives query
    ├─ Evaluates RLS policies using auth.uid()
    ├─ Filters/allows rows based on policies
    ↓ (Returns only authorized rows)
PostgREST
    ↓ (Converts to JSON)
Browser
```

### JWT Token

When you sign in:

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "password123"
});

// data.session.access_token is a JWT that says:
// "This is user-123, and their role is 'authenticated'"
```

Every request includes this JWT:

```
GET /rest/v1/games HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                       ↑ JWT token
```

PostgREST extracts the JWT and tells PostgreSQL:
```sql
-- Before running your query, PostgreSQL knows:
auth.uid() = 'user-123'
auth.role() = 'authenticated'
```

### If Token is Missing or Invalid

```
GET /rest/v1/games HTTP/1.1
-- No Authorization header, or invalid JWT

PostgreSQL sets:
auth.uid() = NULL
auth.role() = 'anon'  (anonymous)

RLS policies checked:
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);  -- ← anon users CAN see (true = public)

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);  -- ← anon CAN'T update (NULL ≠ id)
```

---

## RLS Security Considerations

### What RLS Does Protect

✅ Prevent users from reading other users' private data
✅ Prevent users from modifying other users' data
✅ Enforce business logic (only host can delete game)
✅ Prevent privilege escalation (can't give yourself admin role)

### What RLS Does NOT Protect

❌ XSS attacks (if React is hacked, attacker can see what current user sees)
❌ Timing attacks (can infer if a row exists by response time)
❌ Invalid JWTs (if your secret key is compromised)
❌ DoS attacks (RLS doesn't limit request volume)

**That's why you also need**:
- HTTPS (encryption in transit)
- Secret JWT key (never expose)
- Rate limiting (prevent DoS)
- Input validation (prevent SQL injection)
- CORS (prevent cross-site requests)

---

## Testing RLS Locally

### In Supabase Studio

1. Go to SQL Editor
2. Run:
```sql
-- Insert test data
INSERT INTO games (title, sport, created_by, location)
VALUES ('Test Game', 'basketball', 'user-a-uuid', ST_GeogFromText('POINT(0 0)'));

-- Check RLS is working
SELECT * FROM games;  -- Shows 1 row
```

3. Switch to a different user (if you have test accounts)
4. Run:
```sql
SELECT * FROM games;  -- Shows 1 row (public read policy)
```

5. Try to delete:
```sql
DELETE FROM games WHERE id = 'the-test-game-id';
-- Error: new row violates row-level security policy "Hosts can delete own games"
-- (Because you're not the host)
```

### In Your React App

```typescript
// Sign in as User A
await supabase.auth.signInWithPassword({
  email: "user-a@example.com",
  password: "password"
});

// Create a game
const { data: game } = await supabase
  .from("games")
  .insert([{ title: "My Game", sport: "basketball" }]);

// Sign out
await supabase.auth.signOut();

// Sign in as User B
await supabase.auth.signInWithPassword({
  email: "user-b@example.com",
  password: "password"
});

// Try to delete User A's game
const { error } = await supabase
  .from("games")
  .delete()
  .eq("id", game.id);

console.log(error.message);  // "new row violates row-level security policy"
```

---

## Summary

| Concept | Purpose | Example |
|---------|---------|---------|
| **RLS Enable** | Turn on authorization checking | `ALTER TABLE games ENABLE ROW LEVEL SECURITY;` |
| **RLS Policy** | Define who can read/write | `CREATE POLICY ... USING (id = auth.uid());` |
| **auth.uid()** | Get current user's ID | `WHERE created_by = auth.uid()` |
| **auth.role()** | Get current user's role | `WHERE auth.role() = 'authenticated'` |
| **SECURITY DEFINER** | Run function with elevated privileges | Allows RPC to modify restricted tables |
| **WITH CHECK** | Validate data on INSERT/UPDATE | `WITH CHECK (user_id = auth.uid())` |
| **USING** | Filter rows on SELECT/UPDATE/DELETE | `USING (created_by = auth.uid())` |

RLS is your defense layer that prevents unauthorized access. Combined with RPCs for application logic and constraints for data integrity, it ensures your database is secure even if the application layer is compromised.
