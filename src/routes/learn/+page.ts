import { redirect } from '@sveltejs/kit';

/** The rules moved into the New Game screen, under `?mode=learn`. */
export const load = () => redirect(308, '/play?mode=learn');
