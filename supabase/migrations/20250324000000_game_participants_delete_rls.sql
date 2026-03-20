-- Allow users to remove their own row from game_participants (Unjoin / leave).
-- Without this policy, DELETE is denied by RLS and the UI cannot persist leaving a game.

drop policy if exists "Users can delete own participation" on public.game_participants;
create policy "Users can delete own participation"
  on public.game_participants for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
