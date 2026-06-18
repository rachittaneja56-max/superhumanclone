# Clerk Auth Setup

Use this checklist when configuring Clerk for Aethra.

## 1. Create the Clerk app

1. Open the Clerk Dashboard.
2. Create or open the Aethra application.
3. Choose the Next.js App Router integration.

## 2. Add app environment variables

Add these variables to the Next.js app environment:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
```

Keep the existing Corsair variables in place:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Clerk handles sign-in sessions. Corsair still handles Gmail and Calendar provider tokens.

## 3. Enable Google in Clerk

1. In Clerk Dashboard, open `SSO connections`.
2. Select `Add connection`.
3. Choose `For all users`.
4. Select `Google`.
5. Turn on `Enable for sign-up and sign-in`.
6. For production, also turn on `Use custom credentials`.
7. Copy the Authorized Redirect URI shown by Clerk.

## 4. Create the Google OAuth app for Clerk

Use a separate Google OAuth app for Clerk sign-in in production.

1. Open Google Cloud Console.
2. Create a new OAuth client of type `Web application`.
3. Add your production origins, for example:
   - `https://yourdomain.com`
   - `https://www.yourdomain.com`
4. Add the exact Clerk Authorized Redirect URI from the Clerk Dashboard.
5. Copy the Google Client ID and Client Secret into the Google connection inside Clerk.

## 5. Configure deployment

For the Next.js app deployment, add:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`

Keep existing app variables such as:

- `DATABASE_URL`
- `AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Railway worker settings do not need Clerk keys unless worker code starts reading Clerk directly.

## 6. Verify after deploy

1. Visit `/login`.
2. Start Google sign-in.
3. Confirm an existing Aethra user is matched to the same local `users` row.
4. Confirm a new user gets a local row and can finish onboarding.
5. Confirm `/dashboard`, `/inbox`, `/calendar`, `/billing`, and `/settings` still load after sign-in.
6. Confirm Gmail and Calendar connection still works from onboarding/settings.
