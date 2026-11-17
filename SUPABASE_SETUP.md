# Supabase cloud storage

The app stores each signed-in user's library as one JSON document in `public.user_libraries`. Row-level security restricts reads and writes to the authenticated owner. The browser uses only the Supabase project URL and public anon key; never add a service-role key to the app.

## Configure Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. In Authentication settings, enable email sign-in. Set the Site URL to `https://livin-library.vercel.app` and add these Redirect URLs:
   - `https://livin-library.vercel.app/**`
   - `http://localhost:5173/**`
4. Turn on sign-in methods under Authentication → Sign In / Providers:
   - **Email**: keep it enabled and turn **off** "Confirm email" so friends can create a password account without waiting for an email (Supabase's built-in sender is limited to a few emails per hour).
   - **Google** (recommended): create an OAuth client in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application). Add the callback URL shown on Supabase's Google provider page as an authorised redirect URI, then paste the Client ID and Secret into Supabase and enable the provider.
5. Copy the Project URL and anon/public key from the project's API settings.

## Configure the app

For local development, copy `.env.example` to `.env`, fill in the Project URL and anon/public key, then run:

```sh
npm run dev
```

In Vercel, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables for the deployments you use, then redeploy. Do not use a service-role or secret key as `SUPABASE_ANON_KEY`.

Without both values, the app uses browser local storage. With Supabase configured, unauthenticated edits remain local. On the first sign-in, the app copies that browser's saved library to the account only if the account has no cloud row. If the account already has a cloud library, it is loaded without overwriting it; export the local library first if you need to merge it using Settings → Your data → Import.

Cloud writes replace the user's JSON document, so concurrent edits from multiple devices are last-write-wins. Keep using the JSON export in Settings for backups.