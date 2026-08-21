import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/api';

/**
 * Who you are, and what you have. Returns `{ user: null }` when signed out
 * rather than 401 — every page asks this on load, and being signed out is an
 * ordinary answer, not an error.
 */
export const GET: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) return json({ user: null });

  const profile = await db(event)
    .prepare('SELECT gold, card_back FROM profiles WHERE user_id = ?1')
    .bind(user.id)
    .first();

  return json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: !!user.email_verified
    },
    gold: (profile?.gold as number) ?? 0,
    cardBack: (profile?.card_back as string) ?? 'default'
  });
};
