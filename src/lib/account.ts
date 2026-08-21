import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Who is signed in, as the client sees it.
 *
 * The server is the authority; this is a cache of `/api/profile` so the nav and
 * the shop can render without each asking again. **Never write gold here and
 * expect it to stick** — only a server award changes a balance.
 */

export interface Account {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
}

export interface AccountState {
  loading: boolean;
  user: Account | null;
  gold: number;
  cardBack: string;
}

const initial: AccountState = { loading: true, user: null, gold: 0, cardBack: 'default' };

function createAccount() {
  const { subscribe, set } = writable<AccountState>(initial);

  async function refresh(): Promise<AccountState> {
    if (!browser) return initial;
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const next: AccountState = {
        loading: false,
        user: data.user ?? null,
        gold: data.gold ?? 0,
        cardBack: data.cardBack ?? 'default'
      };
      set(next);
      return next;
    } catch {
      // Offline, or accounts unavailable. Signed-out play must still work, so
      // this is not an error the player is shown.
      const next = { ...initial, loading: false };
      set(next);
      return next;
    }
  }

  /** Posts to an auth endpoint and returns its error message, or null on success. */
  async function post(path: string, body: unknown): Promise<string | null> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      await refresh();
      return null;
    }
    try {
      const data = await res.json();
      return data.message ?? data.error ?? 'Something went wrong.';
    } catch {
      return 'Something went wrong.';
    }
  }

  return {
    subscribe,
    refresh,
    signup: (email: string, username: string, password: string) =>
      post('/api/auth/signup', { email, username, password }),
    login: (email: string, password: string) => post('/api/auth/login', { email, password }),
    logout: () => post('/api/auth/logout', {}),
    requestReset: (email: string) => post('/api/auth/request-reset', { email }),
    resetPassword: (token: string, newPassword: string) =>
      post('/api/auth/reset-password', { token, newPassword }),
    verifyEmail: (token: string) => post('/api/auth/verify-email', { token })
  };
}

export const account = createAccount();
