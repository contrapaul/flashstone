import { json, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE, clearedSessionCookie, deleteSession } from '$lib/server/session';
import { db } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  await deleteSession({ DB: db(event) }, event.cookies.get(SESSION_COOKIE));
  return json({ ok: true }, { headers: { 'Set-Cookie': clearedSessionCookie() } });
};
