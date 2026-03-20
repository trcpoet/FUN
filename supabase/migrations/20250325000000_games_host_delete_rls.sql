-- Hosts can remove their own game row (cascades to participants, messages, game_results).

drop policy if exists "Hosts can delete own games" on public.games;
create policy "Hosts can delete own games"
  on public.games for delete
  using (auth.uid() = created_by);

notify pgrst, 'reload schema';
