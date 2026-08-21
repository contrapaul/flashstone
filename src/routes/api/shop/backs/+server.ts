import { json, error, type RequestHandler } from '@sveltejs/kit';
import { db, readJson, requireUser } from '$lib/server/api';
import { buyBack, listBacks, selectBack } from '$lib/server/shop';

export const GET: RequestHandler = async (event) => {
  const user = requireUser(event);
  return json(await listBacks(db(event), user.id));
};

export const POST: RequestHandler = async (event) => {
  const DB = db(event);
  const user = requireUser(event);
  const body = await readJson(event);
  const backId = String(body.backId ?? '');
  const action = String(body.action ?? 'buy');

  const result =
    action === 'select'
      ? await selectBack(DB, user.id, backId)
      : await buyBack(DB, user.id, backId);

  if (!result.ok) error(400, result.reason ?? 'Could not do that.');
  return json(result);
};
