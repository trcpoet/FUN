# Concurrent Booking Fix: Detailed Explanation

## The Problem

In a multi-user environment, many people can see the same game with "1 spot left." If 5 people click Join at the same millisecond, the old code could allow all 5 to book that 1 spot:

```
Timeline of Race Condition (OLD):

Time 0ms:  User A requests join
Time 1ms:  User B requests join
Time 2ms:  User C requests join
           ↓
           Server receives all 3 requests
           
Request A:  SELECT COUNT(*) FROM game_participants WHERE game_id = $1
            → returns 1 (1 person already joined)
            → 1 < 2 (spots_needed) ✓ OK to join
            
            INSERT INTO game_participants (game_id, user_id)
            → Success
            
Request B:  SELECT COUNT(*) FROM game_participants WHERE game_id = $1
            → returns 1 (still 1! Request A's insert hasn't committed yet)
            → 1 < 2 ✓ OK to join
            
            INSERT INTO game_participants (game_id, user_id)
            → Success
            
Request C:  SELECT COUNT(*) FROM game_participants WHERE game_id = $1
            → returns 1 (still 1! Requests A & B haven't committed)
            → 1 < 2 ✓ OK to join
            
            INSERT INTO game_participants (game_id, user_id)
            → Success
            
Result: 3 people joined a 2-person game ❌
```

## The Solution

**Row-level locking** in a transaction ensures only one request at a time can check+book:

```
Timeline of Atomic Booking (NEW):

Time 0ms:  User A requests join
Time 1ms:  User B requests join
Time 2ms:  User C requests join
           ↓
           Server receives all 3 requests
           
Request A:  BEGIN TRANSACTION
            SELECT spots_needed FROM games WHERE id = $1 FOR UPDATE
            → Acquires LOCK on game row
            
            SELECT COUNT(*) FROM game_participants WHERE game_id = $1
            → returns 1
            → 1 < 2 ✓ OK to join
            
            INSERT INTO game_participants (game_id, user_id)
            → Success
            
            COMMIT
            → Lock released
            
Request B:  BEGIN TRANSACTION
            SELECT spots_needed FROM games WHERE id = $1 FOR UPDATE
            → WAITS for Request A's lock to release
            
            [A commits, lock released]
            
            SELECT COUNT(*) FROM game_participants WHERE game_id = $1
            → returns 2 (now includes A's insert)
            → 2 < 2? NO ❌ Game is full
            
            ROLLBACK
            → Returns error: "Game is full"
            
Request C:  [Similar to B - also rejects]

Result: 1 person joins, 2 people get "Game is full" ✅
```

## What Changed

### 1. Database: New RPC Function

**File**: `supabase/migrations/20260404000000_atomic_join_game.sql`

Created function:
```sql
create or replace function public.join_game(p_game_id uuid)
returns jsonb
```

**Key features**:
- `FOR UPDATE` locks the game row (prevents concurrent modifications)
- Counts participants while row is locked
- Checks capacity before inserting
- Returns JSON: `{success: bool, error?: string, spots_needed?: int, ...}`
- Handles errors gracefully (game not found, already joined, full)

### 2. API Layer: Updated Client

**File**: `src/lib/api.ts`

Changed `joinGame()` to:
- Call the new RPC instead of direct table insert
- Return object with error + optional spots info
- Passes through database validation result to UI

### 3. React Component: Better Error Handling

**File**: `src/app/App.tsx`

Updated `handleJoinGame()` to:
- Show error message to user when booking fails
- Distinguish between "game full", "already joined", "not found"
- Only refresh state on success

## Why This Works

1. **Transaction isolation**: All database operations happen inside one transaction
2. **Row locking**: `FOR UPDATE` prevents other transactions from modifying the game row
3. **Atomic insert**: By the time we INSERT, we've already verified capacity
4. **No race window**: Check + Insert happen as one indivisible unit

## Performance Impact

- ✅ Minimal: Row lock is held for ~1-2ms per request
- ✅ Fair queuing: Requests wait in order (not first-come-first-served, but fair)
- ✅ No stale data: Always reads current state
- ✅ Better than optimistic locking: One round-trip, not two

## Backward Compatibility

- ✅ Old code that called `game_participants` direct insert still works
- ✅ New RPC is additive (doesn't replace old behavior)
- ⚠️ Recommend using new RPC for all new joins to prevent race conditions

## Testing Checklist

- [ ] Applied migration to Supabase
- [ ] Ran `NOTIFY pgrst, 'reload schema';`
- [ ] App builds: `npm run build`
- [ ] Tested race condition with 2 browser windows
- [ ] Tested "game full" error message
- [ ] Tested "already joined" error
- [ ] Deployed to Vercel
- [ ] Applied migration to production database
- [ ] Reloaded production schema cache
