<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { account } from '$lib/account';

  /**
   * Sign in, sign up, and password reset — all on one page, because they are
   * the same three fields in different arrangements and a player arriving from
   * an email link should not have to navigate.
   *
   * Verification and reset links land on `/?verify=` and `/?reset=` (matching
   * the `time` repo's URLs); the layout forwards them here.
   */
  type Mode = 'login' | 'signup' | 'forgot' | 'reset';

  let mode: Mode = 'login';
  let email = '';
  let username = '';
  let password = '';
  let busy = false;
  let message: string | null = null;
  let notice: string | null = null;
  let resetToken = '';

  onMount(async () => {
    await account.refresh();
    const params = $page.url.searchParams;

    const verify = params.get('verify');
    if (verify) {
      const err = await account.verifyEmail(verify);
      notice = err ?? 'Your email is verified. Welcome to Flashstone.';
      message = err;
    }

    const reset = params.get('reset');
    if (reset) {
      resetToken = reset;
      mode = 'reset';
      notice = 'Choose a new password.';
    }
  });

  async function submit() {
    if (busy) return;
    busy = true;
    message = null;
    notice = null;

    if (mode === 'login') {
      message = await account.login(email, password);
    } else if (mode === 'signup') {
      message = await account.signup(email, username, password);
      if (!message) notice = 'Account created. Check your email to verify the address.';
    } else if (mode === 'forgot') {
      message = await account.requestReset(email);
      // Deliberately the same answer whether or not the account exists.
      if (!message) notice = 'If that email has an account, a reset link is on its way.';
    } else {
      message = await account.resetPassword(resetToken, password);
      if (!message) {
        notice = 'Password changed. Sign in with your new password.';
        mode = 'login';
        password = '';
      }
    }
    busy = false;
  }

  async function signOut() {
    busy = true;
    await account.logout();
    busy = false;
    notice = 'Signed out.';
  }

  const TITLES: Record<Mode, string> = {
    login: 'Sign in',
    signup: 'Create an account',
    forgot: 'Reset your password',
    reset: 'Choose a new password'
  };
</script>

<svelte:head><title>Account — Flashstone</title></svelte:head>

<main>
  {#if $account.loading}
    <p class="muted">Loading…</p>
  {:else if $account.user && mode !== 'reset'}
    <section class="panel">
      <h1>{$account.user.username}</h1>
      <p class="muted">{$account.user.email}</p>

      <dl class="stats">
        <div><dt>Gold</dt><dd>{$account.gold}</dd></div>
        <div>
          <dt>Email</dt>
          <dd>{$account.user.emailVerified ? 'Verified' : 'Not verified'}</dd>
        </div>
      </dl>

      {#if notice}<p class="notice">{notice}</p>{/if}

      <button on:click={signOut} disabled={busy}>Sign out</button>
    </section>
  {:else}
    <section class="panel">
      <h1>{TITLES[mode]}</h1>

      {#if mode === 'login'}
        <p class="muted">
          Your collection, decks and gold follow your account to any browser. You can play
          against the AI without one.
        </p>
      {/if}

      <form on:submit|preventDefault={submit}>
        {#if mode !== 'reset'}
          <label>
            <span>Email</span>
            <input type="email" bind:value={email} autocomplete="email" required />
          </label>
        {/if}

        {#if mode === 'signup'}
          <label>
            <span>Username</span>
            <input
              bind:value={username}
              autocomplete="username"
              minlength="3"
              maxlength="24"
              required
            />
            <span class="hint">3–24 characters: letters, numbers, - or _</span>
          </label>
        {/if}

        {#if mode !== 'forgot'}
          <label>
            <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
            <input
              type="password"
              bind:value={password}
              autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
              minlength="8"
              required
            />
            {#if mode !== 'login'}<span class="hint">At least 8 characters</span>{/if}
          </label>
        {/if}

        {#if message}<p class="error">{message}</p>{/if}
        {#if notice}<p class="notice">{notice}</p>{/if}

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : TITLES[mode]}
        </button>
      </form>

      <div class="switch">
        {#if mode === 'login'}
          <button class="link" on:click={() => (mode = 'signup')}>Create an account</button>
          <button class="link" on:click={() => (mode = 'forgot')}>Forgot password?</button>
        {:else if mode !== 'reset'}
          <button class="link" on:click={() => (mode = 'login')}>Back to sign in</button>
        {/if}
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 460px;
    margin: 0 auto;
    padding: 60px 16px;
  }

  .panel {
    padding: 26px 28px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(38, 27, 16, 0.9), rgba(22, 15, 9, 0.9));
  }

  h1 {
    margin: 0 0 6px;
    font-family: var(--display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold-bright);
  }

  .muted {
    margin: 0 0 18px;
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-dim);
    text-wrap: pretty;
  }

  form { display: flex; flex-direction: column; gap: 14px; }

  label { display: flex; flex-direction: column; gap: 5px; }

  label span {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }

  input {
    padding: 9px 11px;
    border: 1px solid var(--rule);
    border-radius: 4px;
    background: var(--ink-2);
    color: var(--text);
    font-family: var(--body);
    font-size: 15px;
  }
  input:focus { outline: none; border-color: var(--frame-lit); }

  .hint {
    font-family: var(--body) !important;
    font-size: 11px !important;
    letter-spacing: 0 !important;
    text-transform: none !important;
    color: var(--text-faint) !important;
  }

  .error,
  .notice {
    margin: 0;
    padding: 9px 11px;
    border-radius: 4px;
    font-family: var(--body);
    font-size: 13.5px;
    line-height: 1.45;
  }
  .error {
    border: 1px solid var(--blood-deep);
    background: rgba(140, 44, 36, 0.18);
    color: #f0c4bd;
  }
  .notice {
    border: 1px solid #4a6c3c;
    background: rgba(90, 140, 80, 0.15);
    color: #cde5c2;
  }

  button[type='submit'],
  .panel > button {
    margin-top: 4px;
    padding: 11px 20px;
    border: 1px solid #8a6c3c;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--gold), #9c7c3c);
    color: #2a1d10;
    cursor: pointer;
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  button:disabled { opacity: 0.6; cursor: default; }

  .switch {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-family: var(--body);
    font-size: 13px;
    color: var(--text-dim);
    text-decoration: underline;
  }
  .link:hover { color: var(--gold-bright); }

  .stats {
    display: flex;
    gap: 28px;
    margin: 18px 0;
    padding: 14px 0;
    border-top: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
  }
  .stats dt {
    font-family: var(--display);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .stats dd {
    margin: 4px 0 0;
    font-family: var(--body);
    font-size: 18px;
    color: var(--text);
  }
</style>
