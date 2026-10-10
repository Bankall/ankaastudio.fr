# Instagram feed Lambda

Mirrors the studio's latest Instagram posts into S3 once a day so the home page
can show them **without the browser ever touching Meta's API**.

## Why resize

Instagram's `media_url` is the full-resolution original — up to 3277×4096 and
1.7 MB — and the home page draws it in a card about 190px wide. Mirroring it
verbatim made the six-card strip ~3.4 MB, and because the originals are
progressive JPEGs the decode cost was worse than the download: the row arrived
one picture at a time no matter how the fade was timed. 640px WebP is ~10×
smaller and ~26× cheaper to decode.

The derivative's extension is part of its key, so the move from `.jpg` to
`.webp` is also what re-derives the posts that were already mirrored — the
existence check would otherwise keep the originals forever. The old
`instagram/media/*.jpg` objects are left behind unreferenced once the feed is
rewritten, and can be deleted at leisure.

## Why a mirror instead of a client-side embed

Instagram's old anonymous/public endpoints are gone, and its Basic Display API
was shut down in December 2024. Any live feed now needs the **Instagram Graph
API** behind a real Meta app and an access token. Calling that from the browser
would expose the token, hit rate limits, fight CORS, and break as soon as
Instagram's short-lived CDN image URLs expire (a few hours).

So this Lambda runs on a daily schedule (EventBridge, `rate(1 day)`):

1. Reads the access token + Instagram user id from SSM.
2. `GET /{user-id}/media` for the latest posts.
3. Downloads each post's image, resizes it to 640px wide WebP and stores it at
   `instagram/media/{id}.webp` in the **media bucket** (immutable — keyed by the
   post id).
4. Writes `instagram/feed.json` (the list the site reads).
5. Refreshes the 60-day long-lived token and writes it back to SSM.

`instagram/*` is served through its own **public** CloudFront behaviour (no
signed cookies, unlike `/media/*`), so the site fetches
`https://ankaastudio.fr/instagram/feed.json` same-origin. The home page
(`src/components/InstagramFeed.jsx`) renders nothing until that file exists, so
the site is safe to deploy before any of the setup below is done.

## feed.json shape

```json
{
	"updatedAt": "2026-08-23T04:00:00.000Z",
	"posts": [
		{
			"id": "17900000000000000",
			"permalink": "https://www.instagram.com/p/XXXXXXXXXXX/",
			"caption": "…",
			"mediaType": "IMAGE",
			"timestamp": "2026-08-20T09:12:00+0000",
			"image": "/instagram/media/17900000000000000.webp"
		}
	]
}
```

## Environment variables

| Variable       | Default            | Notes                                              |
|----------------|--------------------|----------------------------------------------------|
| `MEDIA_BUCKET` | (set by the stack) | Bucket the feed and images are written to.         |
| `SSM_PREFIX`   | `/ankaa/instagram` | Prefix holding `access-token` and `user-id`.       |
| `POST_COUNT`   | `6`                | How many recent posts to mirror.                   |

## One-time Meta / Instagram setup

Ownership: **the developer's own Meta account owns the app**; the studio's
Instagram account is connected to it as a *tester*, not as the owner. That is the
expected shape for the Instagram Login flow — the two accounts are separate. The
app stays in **Development mode** forever: it only ever reads the one account that
accepted the tester invite, so **no App Review** is needed.

The studio's account must be an Instagram **Business** or **Creator** account (a
personal account cannot use the Graph API).

1. **Create a Meta app** under the developer's account at
   <https://developers.facebook.com/apps/> → *Create App*. Add the **Instagram**
   product and pick the use case **"Instagram API with Instagram Login"** — the
   only permission needed is **`instagram_business_basic`** (read-only).
2. In the app → **Instagram → API setup with Instagram login → Roles**, add the
   studio's Instagram account as an **Instagram tester** (by IG username). The
   studio then accepts the invite from their own Instagram:
   **Settings → Apps and websites → Tester invites → Accept**.
3. Generate a **long-lived Instagram user access token** for the studio account
   (the token generator in the app dashboard). It lasts 60 days; this Lambda
   refreshes it on every run, so once seeded it stays valid indefinitely.
4. Note the **Instagram user id** the token belongs to (`GET /me?fields=id` on
   `graph.instagram.com`).

## Seed the secrets

The token is a SecureString (encrypted with the default `aws/ssm` KMS key). Use
the same profile/region as the rest of the infra (`eu-west-1`):

```bash
aws ssm put-parameter --name /ankaa/instagram/access-token \
	--type SecureString --value "<LONG_LIVED_TOKEN>" --overwrite \
	--profile bankall --region eu-west-1

aws ssm put-parameter --name /ankaa/instagram/user-id \
	--type String --value "<INSTAGRAM_USER_ID>" --overwrite \
	--profile bankall --region eu-west-1
```

## Deploy

The function is part of the main SAM stack. Build its bundle and deploy the
stack from a workstation (same flow as the gallery lambdas):

```bash
infra/build.sh instagram   # or: infra/build.sh all
cd infra && ./deploy.sh
```

## First run

The schedule fires once a day; trigger the first run by hand:

```bash
aws lambda invoke --function-name ankaa-instagram-feed /dev/stdout \
	--profile bankall --region eu-west-1
```

Then confirm the feed is live:

```bash
curl -s https://ankaastudio.fr/instagram/feed.json | head
```

The home page's Instagram section appears automatically once `feed.json` exists.

## Failure behaviour

- If the Graph API call fails, the Lambda logs the error and **leaves the
  previous `feed.json` untouched** — a bad day keeps yesterday's posts up.
- If the token refresh fails, it logs a warning and keeps the current token; the
  feed write still succeeds.
- Before the secrets are seeded, the Lambda errors on the SSM read and writes
  nothing; the site simply shows no Instagram section.
