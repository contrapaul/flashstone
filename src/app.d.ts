/// <reference types="@sveltejs/kit" />

import type { SessionUser } from '$lib/server/session';

declare global {
  namespace App {
    interface Locals {
      /** Resolved from the session cookie in hooks.server.ts. Null when signed out. */
      user: SessionUser | null;
    }

    interface Platform {
      env: {
        DB: D1Database;
        /** Resend API key. Unset locally — email sending becomes a logged no-op. */
        RESEND_API_KEY?: string;
        RESEND_FROM?: string;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
      };
    }
  }
}

export {};
