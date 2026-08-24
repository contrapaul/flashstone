import { redirect } from '@sveltejs/kit';

/**
 * The lobby moved into the New Game screen. Kept as a redirect rather than
 * deleted: invite links and bookmarks point here, and `?mode=online` lands on
 * the tab this route used to be.
 */
export const load = () => redirect(308, '/play?mode=online');
