import { json, type RequestHandler } from '@sveltejs/kit';
import { db, requireUser } from '$lib/server/api';
import { claimDailyLogin } from '$lib/server/gold';

export const POST: RequestHandler = async (event) => {
  const user = requireUser(event);
  return json(await claimDailyLogin(db(event), user.id));
};
