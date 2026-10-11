# The Hollow Archives — Cloudflare edition

A responsive gothic horror storytelling site with a Cloudflare Workers API and D1 database scaffold. Valid submissions can be published automatically; submissions that trip the basic review rules are stored as `review` and are not shown publicly.

## Project structure

- Static frontend: HTML, CSS, vanilla JavaScript
- `cloudflare/src/index.js`: Worker API
- `cloudflare/migrations/0001_create_stories.sql`: D1 schema
- `cloudflare/wrangler.toml`: Wrangler deployment config template

## What the automatic checks do (and don't do)

The Worker checks required fields, allowed categories, title/story length, email shape, rights/guidelines checkboxes, and a hidden honeypot field. Submissions containing links or likely promotional phrases, or exceptionally long submissions, are held for manual review. Only `approved` stories are returned by the public story API.

These are **basic rules, not AI moderation**. They cannot reliably prove originality, detect every harmful submission, or understand all story content. Visitors must agree to the guidelines. For a public launch, enable Turnstile, publish a clear privacy notice, and periodically check held submissions. Automatic approval means a story can go public immediately when it passes the configured rules.

## Cloudflare setup

Prerequisites: a Cloudflare account and Node.js/npm on your computer.

### 1. Install Wrangler

```bash
npm install --save-dev wrangler
npx wrangler login
```

Run commands from the `cloudflare/` folder.

### 2. Create the D1 database

```bash
npx wrangler d1 create hollow-archives
```

Copy the returned database ID into `cloudflare/wrangler.toml` in place of `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

### 3. Create the schema

```bash
npx wrangler d1 execute hollow-archives --file=./migrations/0001_create_stories.sql
```

For a remote database, use:

```bash
npx wrangler d1 execute hollow-archives --remote --file=./migrations/0001_create_stories.sql
```

### 4. Configure the allowed website origin

Edit `ALLOWED_ORIGIN` in `wrangler.toml` to the exact deployed website origin, for example `https://the-hollow-archives.pages.dev`. Don't include a path. If your site is on a custom domain, use that origin instead.

### 5. Deploy the Worker

```bash
npx wrangler deploy
```

Copy the deployed Worker URL, for example `https://hollow-archives-api.YOUR-SUBDOMAIN.workers.dev`.

### 6. Connect the website to the Worker

- In `js/submit.js`, set `API_BASE` to the Worker URL.
- In `js/stories.js`, set `API_BASE_STORIES` to the same Worker URL.
- Deploy the updated frontend to Cloudflare Pages or another static host.
- Make sure `ALLOWED_ORIGIN` matches the actual public frontend URL exactly.

Do not put any secret keys in `js/*.js`.

### 7. Enable Turnstile (recommended)

1. Create a Turnstile widget in the Cloudflare dashboard for your website domain.
2. Put its **site key** in `TURNSTILE_SITE_KEY` in `js/submit.js`.
3. Add the **secret key** as a Worker secret:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Paste the secret when prompted. The secret must never go in the frontend. Turnstile is optional in this starter; it is enforced server-side only when the Worker secret is configured. Set the matching frontend site key too.

### 8. Test before launch

- Submit a valid original test story (100–30,000 characters) and check it appears in `/api/stories`.
- Submit a test story with a link; it should receive a “waiting for a quick manual check” message and must not appear in `/api/stories`.
- Submit invalid fields and ensure the form displays an error.
- Verify a failed database write is not shown as successful.
- Remove the three demo stories from `DEMO_STORIES` in `js/stories.js` before launch, so demo content doesn't appear if the API is temporarily unavailable.
- Review Cloudflare D1 data and Worker logs during testing.

## API routes

- `GET /api/health` — health check
- `GET /api/stories` — approved stories only
- `POST /api/submissions` — validates and stores submissions

## Important security and publishing notes

- The public endpoint only lists stories whose status is `approved`.
- Never expose an admin database API or D1 credentials to the browser.
- This starter does not include an admin dashboard because your requested workflow is automatic approval for basic guideline-compliant stories. Items marked `review` can be inspected using Cloudflare D1 tools. A private dashboard can be added later if desired.
- The current review flags are simple examples. Adjust them to match your exact guidelines, and don't rely on automated checks to make perfect judgments.
- Publicly displayed stories are public content. Get permission before publishing stories, provide a privacy policy for contact emails, and establish a way to handle copyright/takedown requests.
- The Worker uses an exact allowed origin check for CORS. Configure it correctly before deployment.
- Cloudflare Workers and D1 have account-specific limits and pricing. Check the current plan details before launching at scale.

## Local preview

Open `index.html` in a browser or use a local static server. The API won't work until the Worker and D1 are deployed and configured. Demo stories are used when no API URL is configured.
