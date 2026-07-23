import { betterAuth } from 'better-auth';
import { db } from './db';
import { grantSignupCredits } from './credits';

// Email + password only, by design: no OAuth console to configure, no email
// service to stand up (launch stack is one box + Polar). Better Auth owns the
// user/session/account/verification tables in the same SQLite file as the
// product data — one file to back up, one transaction domain.
export const auth = betterAuth({
  database: db(),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // No email service at launch (deliberate) — so no verification mail and no
    // reset-password flow. Abuse pressure is handled by per-IP limits instead
    // (PLAN.md "free credits are inventory").
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        // The signup grant rides the user-creation hook; addEntry is idempotent
        // on (signup_grant, userId) so a re-fired hook can't double-grant.
        after: async (user) => {
          grantSignupCredits(user.id);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
