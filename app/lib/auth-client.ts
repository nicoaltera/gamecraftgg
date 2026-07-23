'use client';

import { createAuthClient } from 'better-auth/react';

// Same-origin client — auth lives at /api/auth/* on the app origin. Games run
// on the separate game origin and never see these cookies (that separation is
// the whole point of the two-origin design).
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
