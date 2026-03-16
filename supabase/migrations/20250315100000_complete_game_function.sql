-- Migration: complete_game RPC
-- Run after 20250315000000_gamification_avatars_notifications.sql.
-- Marks a game completed, updates user_stats (streaks, XP), awards badges, and creates notifications.

create or replace function public.complete_game(
  p_game_id uuid,
  p_winner_team_or_user text default null,
  p_score jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid;
  v_sport text;
  v_participant record;
  v_games_total int;
  v_games_by_sport jsonb;
  v_cur_streak int;
  v_long_streak int;
  v_xp int;
  v_level int;
  v_last_date date;
  v_new_streak int;
  v_new_xp int;
  v_new_level int;
  v_new_games_by_sport jsonb;
  v_badge record;
begin
  select g.created_by, g.sport into v_host_id, v_sport
  from public.games g
  where g.id = p_game_id and g.status in ('open', 'full');
  if v_host_id is null then
    raise exception 'Game not found or already completed';
  end if;
  if auth.uid() is null or auth.uid() != v_host_id then
    raise exception 'Only the host can complete this game';
  end if;

  insert into public.game_results (game_id, winner_team_or_user, score, confirmed_by_host)
  values (p_game_id, p_winner_team_or_user, p_score, true)
  on conflict (game_id) do update set
    winner_team_or_user = excluded.winner_team_or_user,
    score = excluded.score,
    confirmed_by_host = true;
  update public.games set status = 'completed', updated_at = now() where id = p_game_id;

  for v_participant in
    select gp.user_id from public.game_participants gp where gp.game_id = p_game_id
  loop
    select
      coalesce(us.games_played_total, 0),
      coalesce(us.games_played_by_sport, '{}'::jsonb),
      coalesce(us.current_streak_days, 0),
      coalesce(us.longest_streak_days, 0),
      coalesce(us.xp, 0),
      coalesce(us.level, 1),
      us.last_game_date
    into v_games_total, v_games_by_sport, v_cur_streak, v_long_streak, v_xp, v_level, v_last_date
    from public.user_stats us
    where us.user_id = v_participant.user_id;

    if v_games_total is null then
      v_games_total := 0;
      v_games_by_sport := '{}'::jsonb;
      v_cur_streak := 0;
      v_long_streak := 0;
      v_xp := 0;
      v_level := 1;
      v_last_date := null;
    end if;

    if v_last_date is null then
      v_new_streak := 1;
    elsif v_last_date = current_date then
      v_new_streak := v_cur_streak;
    elsif v_last_date = current_date - 1 then
      v_new_streak := v_cur_streak + 1;
    else
      v_new_streak := 1;
    end if;

    v_new_xp := v_xp + 10;
    v_new_level := 1 + (v_new_xp / 100);
    v_new_games_by_sport := jsonb_set(
      coalesce(v_games_by_sport, '{}'::jsonb),
      array[v_sport],
      to_jsonb(coalesce((v_games_by_sport->>v_sport)::int, 0) + 1),
      true
    );

    insert into public.user_stats (
      user_id, games_played_total, games_played_by_sport,
      current_streak_days, longest_streak_days, xp, level, last_game_date, updated_at
    )
    values (
      v_participant.user_id,
      v_games_total + 1,
      v_new_games_by_sport,
      v_new_streak,
      greatest(v_long_streak, v_new_streak),
      v_new_xp,
      v_new_level,
      current_date,
      now()
    )
    on conflict (user_id) do update set
      games_played_total = public.user_stats.games_played_total + 1,
      games_played_by_sport = excluded.games_played_by_sport,
      current_streak_days = excluded.current_streak_days,
      longest_streak_days = excluded.longest_streak_days,
      xp = excluded.xp,
      level = excluded.level,
      last_game_date = excluded.last_game_date,
      updated_at = now();

    for v_badge in
      select b.id, b.slug from public.badges b
      where not exists (
        select 1 from public.user_badges ub
        where ub.user_id = v_participant.user_id and ub.badge_id = b.id
      )
    loop
      if v_badge.slug = 'first_game' and (v_games_total + 1) >= 1 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      elsif v_badge.slug = 'ten_games' and (v_games_total + 1) >= 10 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      elsif v_badge.slug = 'streak_7' and v_new_streak >= 7 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      end if;
    end loop;

    insert into public.notifications (user_id, type, payload)
    values (v_participant.user_id, 'game_completed', jsonb_build_object('game_id', p_game_id, 'sport', v_sport));
  end loop;
end;
$$;
