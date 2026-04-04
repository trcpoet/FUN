# Atomic Booking Deep Dive: How the Fix Works

## The Race Condition Problem (Detailed)

### What is a race condition?

A race condition happens when the **timing** of concurrent operations affects the outcome, and the outcome depends on which one "wins the race."

In your app:
- Multiple users see the same game with "1 spot left"
- They all click Join at millisecond 0.001, 0.002, 0.003
- The old code couldn't guarantee only 1 would get the spot

### The Old Code Flow (UNSAFE)

```typescript
// src/lib/api.ts (OLD - BROKEN)
export async function joinGame(gameId: string): Promise<Error | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Insert directly into the table
  const { error } = await supabase.from("game_participants").insert({
    game_id: gameId,
    user_id: user.id,
    role: "player",
  });
  return error ? new Error(error.message) : null;
}
```

**What happens on the database**:

```sql
-- User A's request arrives
INSERT INTO game_participants (game_id, user_id, role)
VALUES ('abc-123', 'user-a-id', 'player');

-- User B's request arrives (same millisecond)
INSERT INTO game_participants (game_id, user_id, role)
VALUES ('abc-123', 'user-b-id', 'player');

-- User C's request arrives
INSERT INTO game_participants (game_id, user_id, role)
VALUES ('abc-123', 'user-c-id', 'player');

-- Result: All 3 inserts succeed
-- Game now has 3 participants but spots_needed = 2 ❌
```

**Why didn't it stop at 2?** Because:
1. There's no check before the insert
2. The database doesn't know the game's `spots_needed` limit
3. No constraint prevents 3 rows from the same game

### What we'd NEED to fix it (check + insert)

```sql
-- Pseudocode of what we WANT to happen:

-- Check if there's room
SELECT COUNT(*) FROM game_participants WHERE game_id = 'abc-123';
-- Result: 1 (one person already joined)

IF count < 2 THEN
  -- Insert the user
  INSERT INTO game_participants (game_id, user_id, role)
  VALUES ('abc-123', 'user-b-id', 'player');
END IF;
```

**But here's the problem**: Between the SELECT and INSERT, another request can sneak in.

```
Timeline:

Request A:  SELECT COUNT(*) FROM game_participants WHERE game_id = 'abc-123'
            → Result: 1
            → 1 < 2? YES, proceed
            
            [PAUSE - network/CPU delay]
            
Request B:  SELECT COUNT(*) FROM game_participants WHERE game_id = 'abc-123'
            → Result: 1  ← STILL 1! A's INSERT hasn't committed yet
            → 1 < 2? YES, proceed
            
            [Both requests now INSERT]
            
Request A:  INSERT INTO game_participants...
            → Success
            
Request B:  INSERT INTO game_participants...
            → Success
            
Result: Both got in, game is overbooked ❌
```

This is the classic race condition: two operations step on each other.

---

## The Solution: Atomic Transaction with Row Locking

### What is a transaction?

A transaction is a sequence of SQL operations that either **all succeed or all fail** as one unit. No in-between state.

```sql
BEGIN;           -- Start transaction
SELECT ...;      -- Operation 1
UPDATE ...;      -- Operation 2
INSERT ...;      -- Operation 3
COMMIT;          -- All 3 succeed together, or ROLLBACK if any fails
```

### What is a lock?

A lock prevents other transactions from modifying data while you're reading/modifying it.

**Types of locks**:
- `SELECT ... FOR UPDATE` — Write lock (exclusive, no one else can modify)
- `SELECT ... FOR SHARE` — Read lock (shared, others can read but not write)
- Regular SELECT — No lock (others can modify after you read)

### How `FOR UPDATE` works

```sql
-- User A's transaction
BEGIN;
SELECT spots_needed FROM games WHERE id = 'abc-123' FOR UPDATE;
-- ↑ LOCKS the game row. No other transaction can UPDATE/DELETE it.
-- If User B tries to lock the same row, User B WAITS.

-- ... do checks and inserts ...

COMMIT;
-- ↑ RELEASES the lock. User B's transaction can now acquire it.
```

### Our Atomic Solution (NEW - SAFE)

```sql
create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_spots_needed int;
  v_participant_count int;
begin
  -- Step 1: Get current user
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Step 2: LOCK the game row and fetch spots_needed
  select g.spots_needed
  into v_spots_needed
  from public.games g
  where g.id = p_game_id
  for update;  -- ← THIS IS THE KEY LINE
  
  if v_spots_needed is null then
    return jsonb_build_object('success', false, 'error', 'Game not found');
  end if;

  -- Step 3: Count participants (while row is locked)
  select count(*)
  into v_participant_count
  from public.game_participants gp
  where gp.game_id = p_game_id;

  -- Step 4: Check capacity (while row is locked)
  if v_participant_count >= v_spots_needed then
    return jsonb_build_object(
      'success', false,
      'error', 'Game is full',
      'spots_needed', v_spots_needed,
      'current_participants', v_participant_count
    );
  end if;

  -- Step 5: Check if already joined (while row is locked)
  if exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id and gp.user_id = v_current_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Already joined this game');
  end if;

  -- Step 6: Insert participant (while row is locked)
  insert into public.game_participants (game_id, user_id, joined_at)
  values (p_game_id, v_current_user_id, now());

  return jsonb_build_object(
    'success', true,
    'message', 'Joined game successfully',
    'spots_needed', v_spots_needed,
    'current_participants', v_participant_count + 1
  );
exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;
```

### How it prevents the race condition

```
Timeline with atomic RPC:

Request A (User A):
  1. Calls join_game('abc-123')
  2. BEGIN TRANSACTION
  3. SELECT spots_needed FROM games WHERE id = 'abc-123' FOR UPDATE
     → ACQUIRES EXCLUSIVE LOCK on game row
     → Fetches spots_needed = 2
  4. SELECT COUNT(*) FROM game_participants WHERE game_id = 'abc-123'
     → Returns 1 (one person already joined)
  5. 1 < 2? YES ✓ OK to join
  6. Check if already joined: NO
  7. INSERT INTO game_participants...
     → Success
  8. COMMIT
     → RELEASES LOCK ↓

Request B (User B):
  [WAITING... cannot acquire lock while A holds it]

  [A commits and releases lock]
  
  1. BEGIN TRANSACTION
  2. SELECT spots_needed FROM games WHERE id = 'abc-123' FOR UPDATE
     → ACQUIRES EXCLUSIVE LOCK
  3. SELECT COUNT(*) FROM game_participants WHERE game_id = 'abc-123'
     → Returns 2 ← NOW INCLUDES A's INSERT
  4. 2 < 2? NO ❌ Game is full
  5. Return error: 'Game is full'
  6. ROLLBACK (nothing to commit anyway)
     → RELEASES LOCK

Request C (User C):
  [Waits for B's lock to release, then same result as B: 'Game is full']

Result: A joins successfully, B and C get error messages ✅
```

**Key insight**: The lock ensures that steps 3-7 are **atomic** for each user. No other transaction can sneak in and modify the game state while one transaction is executing.

---

## PostgreSQL Transactions & ACID Properties

Our solution leverages PostgreSQL's **ACID** properties:

### A — Atomicity
All-or-nothing. Steps 1-7 in the RPC either all happen or none happen.

```sql
-- If step 7 (INSERT) fails due to a constraint:
CREATE UNIQUE INDEX one_participant_per_user_per_game
ON game_participants(game_id, user_id);

-- And we try to insert the same user twice:
-- The entire transaction ROLLS BACK, not just the insert.
-- User sees: "Already joined this game" (caught at step 5)
```

### C — Consistency
All constraints are checked. The database is never in an inconsistent state.

- Game capacity is never exceeded
- One user can't join the same game twice
- Game row is always valid

### I — Isolation
Your transaction doesn't interfere with others. The lock ensures this.

**Isolation levels** (not used here, but important context):
- `READ UNCOMMITTED` — Can see uncommitted changes from other transactions (dangerous)
- `READ COMMITTED` — Only sees committed changes (default)
- `REPEATABLE READ` — Snapshot of data at transaction start
- `SERIALIZABLE` — Transactions execute as if they're serial (no concurrency)

Our lock + transaction effectively achieves `SERIALIZABLE` behavior for the game row.

### D — Durability
Once `COMMIT` succeeds, it's permanent (even if server crashes).

---

## RLS (Row Level Security) Policies

Now let's talk about the **permission layer** that controls WHO can do what.

### What is RLS?

RLS is a Postgres feature that automatically filters rows based on the current user. It's like adding a `WHERE` clause to every query.

### Why do we need it?

Without RLS:
```sql
-- Any authenticated user could see ANY game
SELECT * FROM games;
-- Returns all games, even secret ones

-- Any user could delete any participant row
DELETE FROM game_participants WHERE id = '...';
-- Could delete other users' joins
```

With RLS:
```sql
-- Query automatically filtered
SELECT * FROM games;
-- Returns: games WHERE created_by = current_user OR status = 'public'

-- Delete only works on own rows
DELETE FROM game_participants WHERE id = '...' AND user_id = current_user;
```

### How RLS works

**Step 1: Enable RLS on a table**

```sql
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
```

This means: "From now on, no one can read/write rows unless a policy explicitly allows it."

**Step 2: Create policies**

```sql
-- Policy 1: Anyone can read games
CREATE POLICY "Games are viewable by everyone"
ON public.games
FOR SELECT
USING (true);  -- ← "true" means no filtering, all rows visible

-- Policy 2: Only authenticated users can create games
CREATE POLICY "Authenticated users can create games"
ON public.games
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Policy 3: Only the host can delete their own game
CREATE POLICY "Hosts can delete own games"
ON public.games
FOR DELETE
USING (auth.uid() = created_by);
```

### Our game_participants RLS

```sql
-- Anyone can see who joined
CREATE POLICY "Participants are viewable by everyone"
ON public.game_participants
FOR SELECT
USING (true);

-- Authenticated users can join games
CREATE POLICY "Authenticated users can join games"
ON public.game_participants
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
```

**What happens when you call our RPC**:

```sql
-- Inside join_game RPC (security definer means it runs as Postgres role, not user):
INSERT INTO game_participants (game_id, user_id, joined_at)
VALUES (p_game_id, v_current_user_id, now());
```

Because the RPC has `security definer`, it runs with elevated privileges. The RLS policy is still checked, but since `WITH CHECK (auth.role() = 'authenticated')` is true, it passes.

### RLS + RPC = Security

RLS policies control **what rows you see/modify**.
RPCs control **what logic runs before you see/modify**.

Together:
- **RLS prevents**: User A deleting User B's join records
- **RPC prevents**: User A joining the same game twice or overflowing capacity

---

## The Full Flow: From React to Database

### Step 1: User clicks "Join" button in React

```typescript
// App.tsx
const handleJoinGame = async (gameId: string) => {
  const result = await joinGame(gameId);  // Call API function
  if (result.error) {
    alert(`Could not join game: ${result.error.message}`);
  }
};
```

### Step 2: API function calls the RPC

```typescript
// src/lib/api.ts
export async function joinGame(gameId: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.rpc("join_game", {
    p_game_id: gameId,
  });
  
  if (error) {
    return { error: new Error(error.message) };
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) {
    return { error: new Error(result?.error ?? "Failed to join game") };
  }

  return { error: null };
}
```

### Step 3: Supabase sends RPC call to Postgres

```
Browser                     PostgREST API               PostgreSQL
   |                             |                          |
   |------ POST /rpc/join_game --|                          |
   |        { p_game_id: ... }   |                          |
   |                             |-- CALL join_game(...) -->|
   |                             |                          |
```

### Step 4: PostgreSQL executes the RPC function (inside a transaction)

```
PostgreSQL (executing join_game):

1. BEGIN TRANSACTION
2. SELECT spots_needed FROM games WHERE id = ? FOR UPDATE
   → Acquires lock, waits if needed
3. SELECT COUNT(*) FROM game_participants WHERE game_id = ?
4. IF count < spots_needed:
5.   SELECT 1 FROM game_participants WHERE game_id = ? AND user_id = ?
6.   IF not exists:
7.     INSERT INTO game_participants...
8. COMMIT
```

### Step 5: PostgreSQL returns result to PostgREST

```json
{
  "success": true,
  "message": "Joined game successfully",
  "spots_needed": 2,
  "current_participants": 2
}
```

### Step 6: PostgREST sends response to browser

```
PostgreSQL                  PostgREST API               Browser
   |                             |                          |
   |-- return { success: ... } ->|                          |
   |                             |-- POST 200 OK ---------->|
   |                             | { success: true, ... }   |
```

### Step 7: React updates UI

```typescript
// Back in handleJoinGame
const result = await joinGame(gameId);
if (result.error) {
  alert(...);  // Show error
} else {
  // Success: refresh game list
  await reloadJoinedGameIds();
  refetchGames();
}
```

---

## Why This is Safer Than Java, Node, Python, etc.

The atomic operation happens **at the database level**, not in the application code.

### If we did it in Node.js (WRONG):

```javascript
// This would NOT prevent the race condition
async function joinGame(gameId) {
  const count = await db.query(
    'SELECT COUNT(*) FROM game_participants WHERE game_id = $1',
    [gameId]
  );
  
  if (count < spotsNeeded) {
    await db.query(
      'INSERT INTO game_participants (game_id, user_id) VALUES ($1, $2)',
      [gameId, userId]
    );
  }
}
```

**Problem**: Between the SELECT and INSERT, another Node server instance could be checking the same game.

### If we did it in Java (WRONG):

```java
// Even with Java's transactions, if running multiple instances:
@Transactional
public void joinGame(String gameId) {
  int count = query("SELECT COUNT(*)...");
  if (count < spotsNeeded) {
    insert("INSERT INTO game_participants...");
  }
}
```

**Problem**: If you have 5 Java servers running, each checking the count at the same time, all 5 might think there's room.

### Why the database is the right place (RIGHT):

The database is a **single source of truth**. It can:
1. Lock a row
2. Force all operations for that row to be sequential
3. Guarantee only one thread/process modifies it at a time

This is why we moved the logic to PostgreSQL instead of keeping it in the application layer.

---

## Other Backend Materials: Understanding the Schema

### Game Lifecycle

```sql
CREATE TABLE public.games (
  id uuid primary key,                    -- Unique ID
  title text not null,                    -- "Basketball at Central Park"
  sport text not null,                    -- "basketball"
  spots_needed int not null default 2,    -- How many people needed
  starts_at timestamptz,                  -- When the game is (nullable = untimed)
  location geography(point, 4326),        -- PostGIS point (lat, lng)
  created_by uuid references auth.users,  -- Who created it
  created_at timestamptz,                 -- When it was created
  updated_at timestamptz                  -- Last update
);
```

### Participants Table

```sql
CREATE TABLE public.game_participants (
  id uuid primary key,
  game_id uuid references public.games(id) ON DELETE CASCADE,  -- Which game
  user_id uuid references auth.users(id) ON DELETE CASCADE,    -- Which user
  joined_at timestamptz default now(),
  
  -- This unique constraint prevents one user from joining the same game twice
  UNIQUE(game_id, user_id)
);
```

**The `UNIQUE(game_id, user_id)` constraint**:
- If User A tries to insert a second row for game abc-123, the database rejects it
- We catch this in the RPC and return "Already joined this game"

### Indexes (for performance)

```sql
-- Games location indexed for fast geographic search
CREATE INDEX games_location_idx ON public.games USING gist(location);
```

`GIST` (Generalized Search Tree) is a special index type for PostGIS geographic data. It makes queries like "games within 5km of here" fast.

### Constraints (for data integrity)

```sql
-- Prevent negative spots
ALTER TABLE public.games 
ADD CONSTRAINT positive_spots CHECK (spots_needed > 0);

-- Prevent duplicate participants
ALTER TABLE public.game_participants
ADD UNIQUE(game_id, user_id);
```

**Why constraints matter**:
- They enforce rules at the database level
- No amount of Node/Java/Python code can bypass them
- They're always checked before data is inserted

---

## Putting It All Together: The Defense in Depth

Our system has **multiple layers of protection**:

### Layer 1: Application Logic (React)
```typescript
// Disable button while request is pending
const [isJoining, setIsJoining] = useState(false);

<button 
  onClick={() => handleJoinGame(gameId)} 
  disabled={isJoining}  // ← Prevent accidental double-click
>
  Join
</button>
```

### Layer 2: API Logic (src/lib/api.ts)
```typescript
// Handle errors gracefully, pass them to UI
const result = await joinGame(gameId);
if (result.error) {
  alert(result.error.message);  // ← User sees "Game is full"
}
```

### Layer 3: RPC Logic (PostgreSQL function)
```sql
-- Validate input, check state, enforce rules
IF v_participant_count >= v_spots_needed THEN
  RETURN jsonb_build_object('success', false, 'error', 'Game is full');
END IF;
```

### Layer 4: Transaction Atomicity (PostgreSQL transaction)
```sql
-- Lock the row, make all operations atomic
SELECT ... FROM games WHERE id = ? FOR UPDATE;
-- All subsequent operations are protected by the lock
```

### Layer 5: Constraints (PostgreSQL constraints)
```sql
-- Unique constraint prevents duplicate joins
UNIQUE(game_id, user_id)

-- Check constraint prevents invalid data
CHECK (spots_needed > 0)
```

### Layer 6: RLS (Row Level Security)
```sql
-- Even if someone tries to hack the database, RLS prevents
-- them from modifying other users' data
CREATE POLICY "Users can only join as themselves"
ON public.game_participants
FOR INSERT
WITH CHECK (user_id = auth.uid());
```

**If Layer 1 fails** (button clicked twice), Layers 2-6 still protect.
**If Layer 2 fails** (API bug), Layers 3-6 still protect.
**If Layer 3 fails** (RPC bug), Layers 4-6 still protect.
**If Layer 4 fails** (transaction bug), Layers 5-6 still protect.
**If Layer 5 fails** (constraint bug), Layer 6 still protects.
**If all else fails**, the database simply rejects invalid data.

---

## Summary

| Concept | Purpose | Layer |
|---------|---------|-------|
| **Transaction** | Atomicity: all-or-nothing | PostgreSQL |
| **Row Lock (FOR UPDATE)** | Isolation: sequential access to same row | PostgreSQL |
| **Constraint (UNIQUE)** | Integrity: enforce business rules | PostgreSQL |
| **RLS Policy** | Authorization: user can only see/modify own data | PostgreSQL |
| **RPC Function** | Logic: complex operations with guaranteed order | PostgreSQL |
| **API Error Handling** | UX: tell user what went wrong | Application |
| **Disable Button** | UX: prevent user from clicking twice | React |

This is why the fix is in the database, not in React or any application language. The database is the single source of truth and the only thing that can guarantee atomicity across distributed requests.
