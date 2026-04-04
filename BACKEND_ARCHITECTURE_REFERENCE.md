# FUN Backend Architecture — Quick Reference

## Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React Application                         │
│              (src/lib/api.ts calls here)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Supabase PostgREST API                      │
│      (Converts REST calls to PostgreSQL queries)             │
│                  + Extracts JWT token                         │
│              + Sets auth.uid() for RLS                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            PostgreSQL Database (The Truth Layer)             │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Tables                                                │  │
│  │ • games                                               │  │
│  │ • game_participants                                   │  │
│  │ • profiles                                            │  │
│  │ • profile_locations                                   │  │
│  │ • game_messages                                       │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ RLS Policies (Authorization Layer)                    │  │
│  │ • Games are viewable by everyone                      │  │
│  │ • Users can only update own profile                   │  │
│  │ • Hosts can delete own games                          │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Constraints (Data Integrity)                          │  │
│  │ • UNIQUE(game_id, user_id) on participants           │  │
│  │ • CHECK (spots_needed > 0)                            │  │
│  │ • Foreign key constraints                             │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ RPC Functions (Complex Logic)                         │  │
│  │ • join_game(gameId) — Atomic booking with lock       │  │
│  │ • create_game(...) — Create game + auto-join host    │  │
│  │ • complete_game(...) — End game + award XP/badges    │  │
│  │ • get_games_nearby(...) — Query with geo distance    │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Indexes (Performance)                                 │  │
│  │ • GIST index on games.location (geo search)          │  │
│  │ • Standard indexes on foreign keys                    │  │
│  │ • Trigram indexes for text search                     │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Realtime Subscriptions (Live Updates)                │  │
│  │ • Listen to INSERT on game_messages                   │  │
│  │ • Listen to INSERT on game_participants (joins)      │  │
│  │ • Listen to UPDATE on games (status changes)          │  │
│  │ • And more...                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## How a Request Flows Through the System

### Example: User Joins a Game

```
1. React Component (App.tsx)
   ↓
   User clicks "Join" button
   ↓
2. API Layer (src/lib/api.ts)
   ↓
   await joinGame(gameId)
   ↓
   calls: supabase.rpc("join_game", { p_game_id: gameId })
   ↓
3. PostgREST API (Supabase)
   ↓
   Receives: POST /rest/v1/rpc/join_game
   Extracts JWT token from Authorization header
   Sets session variables:
     • auth.uid() = 'user-123'
     • auth.role() = 'authenticated'
   ↓
4. PostgreSQL Database
   ↓
   Executes the join_game function:
   
   BEGIN TRANSACTION
   
   a) SELECT spots_needed FROM games WHERE id = ? FOR UPDATE
      → Acquires lock on game row
      → Waits if another transaction has lock
   
   b) SELECT COUNT(*) FROM game_participants WHERE game_id = ?
      → Counts how many people already joined
   
   c) IF count >= spots_needed THEN
        RETURN error: 'Game is full'
      END IF
   
   d) IF EXISTS (already joined) THEN
        RETURN error: 'Already joined'
      END IF
   
   e) INSERT INTO game_participants (game_id, user_id, joined_at)
      VALUES (gameId, auth.uid(), now())
      
      Before INSERT, PostgreSQL checks:
      • RLS policy: "Authenticated users can join"
        → auth.role() = 'authenticated' ✓ PASS
      • UNIQUE constraint: UNIQUE(game_id, user_id)
        → No duplicate entry ✓ PASS
      → INSERT succeeds
   
   f) COMMIT TRANSACTION
      → Lock released
      → All changes are permanent
   
   ↓
   Return JSON: { success: true, ... }
   ↓
5. PostgREST API
   ↓
   Converts PostgreSQL result to JSON
   Returns HTTP 200
   ↓
6. API Layer (src/lib/api.ts)
   ↓
   Parses response
   Checks if success = true
   Returns { error: null } to component
   ↓
7. React Component (App.tsx)
   ↓
   Receives result
   If no error:
     • Call reloadJoinedGameIds() (refresh list of joined games)
     • Call refetchGames() (refresh map)
   ↓
   Map updates showing user in game roster
```

---

## Key Layers Explained

### Layer 1: React Application

**Where**: `src/lib/api.ts`, `src/app/App.tsx`, components

**Responsibilities**:
- User interface
- Error handling and UX
- Disabling buttons while loading
- Showing error messages to user

**Cannot do**:
- Prevent race conditions (multiple simultaneous requests)
- Enforce business rules (game capacity)
- Prevent unauthorized access
- Ensure data integrity

### Layer 2: PostgREST API Gateway

**What**: Supabase's automatic REST API

**Responsibilities**:
- Receive HTTP requests
- Extract JWT token
- Set PostgreSQL session variables (`auth.uid()`, `auth.role()`)
- Convert REST to SQL
- Convert SQL results to JSON
- Return HTTP responses

**Handles**:
```
POST /rest/v1/rpc/join_game
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
Content-Type: application/json

{ "p_game_id": "abc-123" }

→ Converts to:
  SELECT join_game('abc-123')
  with session context: auth.uid() = 'user-123'
```

### Layer 3: PostgreSQL Transactions

**What**: Atomic sequences of operations

**Guarantees**:
- **Atomicity**: All or nothing (all succeed or all roll back)
- **Consistency**: All constraints checked
- **Isolation**: No interference from other transactions
- **Durability**: Once committed, it's permanent

**Our use case**:
```sql
BEGIN;
SELECT ... FOR UPDATE;  -- Lock row
SELECT ...;              -- Check state
INSERT ...;              -- Make change
COMMIT;                  -- All atomic
```

If any step fails, entire transaction rolls back.

### Layer 4: RLS (Row Level Security)

**What**: Per-row authorization

**Ensures**:
- User can only see/modify authorized rows
- Even if there's a bug in application code, RLS protects

**How it works**:
```sql
CREATE POLICY "Name" ON table FOR operation USING/WITH CHECK (condition)

-- PostgreSQL automatically adds the condition to every query:
SELECT * FROM games;
↓ Becomes:
SELECT * FROM games WHERE <RLS condition>;
```

### Layer 5: Constraints

**What**: Rules enforced by database

**Examples**:
- `UNIQUE(game_id, user_id)` — One user per game
- `CHECK (spots_needed > 0)` — Positive spots
- `NOT NULL` — Required fields
- Foreign keys — Reference integrity

**Benefit**: Cannot be bypassed by application code

### Layer 6: Indexes

**What**: Data structures for fast lookup

**Types**:
- **B-Tree** (default): Fast equality/range queries
- **GIST**: Fast geographic/complex queries
- **Trigram**: Fast text search with typo tolerance
- **Hash**: Fast equality on large datasets

**Our usage**:
```sql
-- Geographic index for "games within 5km"
CREATE INDEX games_location_idx ON games USING gist(location);

-- Makes this query fast:
SELECT * FROM games
WHERE ST_DWithin(location, point, 5000);  -- 5km radius
```

### Layer 7: RPC Functions

**What**: Server-side logic

**Benefits**:
- Single transaction (atomic)
- Can use PL/pgSQL (Postgres language)
- Can access multiple tables safely
- Cannot be bypassed by client
- Has access to `auth.uid()`

**Example**:
```sql
CREATE FUNCTION join_game(p_game_id uuid)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Complex logic here
  -- All atomic
  -- Cannot be bypassed
END;
$$;
```

### Layer 8: Realtime Subscriptions

**What**: WebSocket connections for live updates

**How it works**:
```typescript
// In React:
supabase
  .channel('game-messages:abc-123')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'game_messages' },
    (payload) => {
      console.log('New message:', payload.new);
    }
  )
  .subscribe();
```

**What happens**:
1. User opens messenger
2. React subscribes to `game_messages` table for INSERT events
3. When anyone sends a message, PostgreSQL notifies subscribers
4. Message appears instantly on all clients (no refresh needed)

---

## Defense in Depth

Each layer protects against different threat vectors:

```
Layer             Protects Against
────────────────────────────────────────────────────────────
React UI          • Accidental misuse (button spam, misclicks)
                  • Network errors (offline, timeout)
                  
PostgREST API     • Invalid requests (malformed JSON)
                  • Missing authentication
                  
Transaction Lock  • Race conditions (simultaneous bookings)
                  • Lost updates (conflicting changes)
                  
RLS Policies      • Unauthorized access (seeing other users' data)
                  • Privilege escalation (user making themselves admin)
                  
Constraints       • Invalid state (negative spots, duplicate entries)
                  • Referential integrity (game deleted, participants orphaned)
                  
Index Performance • Denial of service (slow queries)
                  • Timeouts (user gets error instead of hanging)
                  
Type System       • Type confusion (string instead of number)
                  (TypeScript at application level)
```

If any layer is compromised, others still protect.

---

## The Atomic Join Game Function Explained

This function demonstrates all layers working together:

```sql
CREATE FUNCTION public.join_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Elevated privileges
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_spots_needed int;
  v_participant_count int;
BEGIN
  -- Layer 1: Authentication
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Layer 2: Row Locking (transaction isolation)
  SELECT g.spots_needed
  INTO v_spots_needed
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;  -- ← Exclusive lock, wait for other transactions
  
  IF v_spots_needed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  -- Layer 3: Business Logic (count participants)
  SELECT COUNT(*)
  INTO v_participant_count
  FROM public.game_participants gp
  WHERE gp.game_id = p_game_id;

  -- Layer 4: Validation (check capacity)
  IF v_participant_count >= v_spots_needed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Game is full'
    );
  END IF;

  -- Layer 5: Check for duplicates (implicit constraint check)
  IF EXISTS (
    SELECT 1 FROM public.game_participants gp
    WHERE gp.game_id = p_game_id AND gp.user_id = v_current_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already joined');
  END IF;

  -- Layer 6: The actual insert
  -- Will be checked against:
  -- • RLS policy: "Authenticated users can join"
  -- • UNIQUE constraint: (game_id, user_id)
  INSERT INTO public.game_participants (game_id, user_id, joined_at)
  VALUES (p_game_id, v_current_user_id, now());

  -- Layer 7: Success response
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Joined successfully'
  );

EXCEPTION WHEN OTHERS THEN
  -- Catch any unexpected error
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Layer 8: Permissions
GRANT EXECUTE ON FUNCTION public.join_game(uuid)
TO authenticated, anon;
```

Every layer is working:
1. ✓ Auth check
2. ✓ Row lock (atomic)
3. ✓ Count query (get state)
4. ✓ Validation (check rules)
5. ✓ Duplicate check (prevent dupes)
6. ✓ Insert (make change)
7. ✓ Response (inform client)
8. ✓ Permissions (who can call)

---

## Common Database Operations & Their Layers

### Creating a Game

```
React → API → PostgREST → PostgreSQL

1. create_game() RPC function
   • SECURITY DEFINER (elevated)
   • Inserts into games table
   • Auto-joins the creator as host
   • Returns new game ID
   • All atomic: if auto-join fails, game creation rolls back

2. RLS Policies checked:
   • INSERT: "Authenticated users can create games"
   • INSERT game_participants: "Authenticated users can join"

3. Constraints enforced:
   • spots_needed > 0
   • location is valid

4. Results sent back to React
   • UI updates to show new game
```

### Getting Games Nearby

```
React → API → PostgREST → PostgreSQL

1. get_games_nearby(lat, lng, radius) RPC function
   • Uses PostGIS: ST_DWithin() for distance
   • Filters by radius
   • Returns games within X km
   • Ordered by distance

2. Index used:
   • GIST index on games.location
   • Makes query fast (O(log n) instead of O(n))

3. RLS Policies checked:
   • SELECT: "Games are viewable by everyone"
   • So all games returned (public)

4. Results sent back to React
   • UI renders game pins on map
```

### Updating Profile

```
React → API → PostgREST → PostgreSQL

1. updateMyProfile() direct table update
   • UPDATE profiles SET ... WHERE id = ?
   • Sets updated_at timestamp

2. RLS Policies checked:
   • UPDATE: "Users can update own profile"
   • USING clause: id = auth.uid()
   • If user tries to update someone else's profile, silently rejected

3. Cache invalidated:
   • Client-side cache cleared so next read is fresh

4. Results sent back to React
   • UI updates to show new profile data
```

---

## Summary Table

| Component | Purpose | Security | Performance |
|-----------|---------|----------|-------------|
| **React** | UI/UX | Input validation | Lazy loading |
| **PostgREST** | REST API | JWT extraction | Connection pooling |
| **Transaction** | Atomicity | ACID properties | Locks |
| **RLS** | Authorization | Row-level | Index usage |
| **Constraints** | Integrity | Rules | Checking |
| **RPC** | Logic | Server-side execution | Single round-trip |
| **Index** | Speed | N/A | O(log n) queries |
| **Realtime** | Live updates | WebSocket auth | Efficient broadcast |

This multi-layered approach ensures that even if one layer has a bug or is exploited, the others still provide protection.
