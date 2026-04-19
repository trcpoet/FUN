# Testing Atomic Game Booking

This guide verifies the race condition fix works correctly.

## Setup

1. Run `npm run dev` from `Redesign FUN sports map/`
2. Open http://localhost:5173 in **two separate browser windows** (side by side)
3. Sign in with the same account in both windows
4. Create a game with `spots_needed: 2`

## Test 1: Race condition prevention (2 users, 2 spots)

**Scenario**: Two users click "Join" at the exact same moment for a game with 2 spots, after 1 person already joined.

**Setup**:
1. Create game: "Basketball" at your location, spots_needed = 2
2. User A (Window 1): Join the game ✓ (now 1/2)
3. User B (Window 2): Have your cursor on the Join button

**Test**:
1. Window 1: Refresh (Ctrl+R) to clear the UI state
2. Both windows show "1 joined / 2 spots needed"
3. Window 1 & 2: Click Join button **simultaneously** (within 100ms of each other)

**Expected**:
- Window 1: ✅ "Joined game successfully"
- Window 2: ❌ "Game is full" (error message appears)
- Refresh both: Window 2 should still NOT be a participant

**If you see**:
- Both show success → ⚠️ Race condition still exists (check if migration applied)
- One success, one "full" → ✅ Fix working!

## Test 2: Prevent double-join by same user

**Setup**:
1. User A joins a game
2. User A clicks Join again

**Expected**:
- Second click shows: "Already joined this game"
- User A appears only once in participant list

## Test 3: Capacity enforcement

**Setup**:
1. Create game with spots_needed = 1
2. User A joins (1/1 full)
3. User B tries to join

**Expected**:
- User B sees error: "Game is full"
- Game participant count stays at 1

## Test 4: Normal join flow (no contention)

**Setup**:
1. Create game with spots_needed = 3
2. One user joins, then another

**Expected**:
- Both joins succeed
- Game shows 2/3 filled

## What to check in Network tab

1. Open DevTools → Network tab
2. Filter for API calls
3. When you click Join, you should see:
   - `POST /rest/v1/rpc/join_game` ← This is the atomic RPC
   - Response: `{"success":true,"message":"..."}` or `{"success":false,"error":"..."}`

## If something goes wrong

**Error: "function public.join_game(uuid) does not exist"**
- Migration wasn't applied
- Solution: Paste the migration in Supabase SQL Editor
- Then: `NOTIFY pgrst, 'reload schema';`

**Error: "permission denied for schema public"**
- RLS policies might be blocking
- Solution: Check RLS on game_participants (should allow authenticated users to insert)

**Error: "Game is full" even though there are spots**
- Old participants table had data from before
- Solution: Delete test game and create fresh one
