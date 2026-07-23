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
  // canonical origin comes from BETTER_AUTH_URL; these extras keep sign-in
  // working from www and the fly.dev fallback hostname
  trustedOrigins: ['https://www.gamecraft.gg', 'https://gamecraft.fly.dev'],
  // Free credits are sellable inventory (200cr = $20 of generation per account)
  // and email is unverified, so account farming is the #1 abuse vector. Per-IP
  // signup throttling is the launch-day defense; email verification is the
  // scheduled follow-up once an email service exists.
  // Fly terminates TLS and forwards the real client IP in Fly-Client-IP.
  // Without this, Better Auth can't attribute requests and collapses rate
  // limiting into ONE shared bucket — 5 signups TOTAL per hour, site-wide.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['fly-client-ip', 'x-forwarded-for'],
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/sign-up/email': { window: 3600, max: 5 },
      '/sign-in/email': { window: 600, max: 10 },
    },
  },
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
