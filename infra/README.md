# Ankaa gallery system — infrastructure

A private client-gallery system (Pixieset-like) running entirely serverless:
CloudFront + S3 + three Lambdas, with JSON files in S3 as the database.

> **Every command in this directory uses the `bankall` AWS profile.**
> `lib/env.sh` builds a single `AWS=(aws --profile "$AWS_PROFILE" ...)` array that
> every call goes through, so no script can reach a different account by accident.

---

## What gets built

One CloudFront distribution serves three origins on the same domain, which is
what makes the whole thing work without CORS and with same-origin cookies:

| Path       | Origin                    | Access                                    |
| ---------- | ------------------------- | ----------------------------------------- |
| `/*`       | site bucket (OAC)         | public — the marketing site               |
| `/api/*`   | Lambda Function URL (OAC) | public route, own auth                    |
| `/media/*` | media bucket (OAC)        | signed cookies (previews) / signed URLs (downloads) |

The media bucket's policy only grants CloudFront `media/*`. `db/` (the JSON
database) and `originals/` are unreachable from the internet by construction, not
by configuration — there is no signature that can reach them.

### Two access zones

- `media/g/<gid>/v/*` — watermarked previews. Covered by **signed cookies**
  scoped to `Path=/media/g/<gid>/v/`, so several gallery sessions coexist in one
  browser despite CloudFront's fixed cookie names. 12 h, renewed by the client.
- `media/g/<gid>/d/*` — HD files and ZIPs. **Never** covered by a cookie; each
  download gets its own 5-minute signed URL from the API.

Download blocking is therefore not a UI toggle: with `downloadsEnabled: false`
the API simply refuses to sign anything under `d/`, and nothing else can.

### The three Lambdas

| Function            | Trigger                     | Job                                                            |
| ------------------- | --------------------------- | -------------------------------------------------------------- |
| `ankaa-gallery-api` | CloudFront `/api/*`         | auth, gallery CRUD, presigned uploads, signing, SES sharing     |
| `ankaa-gallery-processor` | async invoke from the API | sharp: watermarked previews, HD JPEG, LQIP, per-photo sidecar |
| `ankaa-gallery-zipper`    | async invoke from the API | streams a store-mode ZIP into S3 multipart                    |

**Single-writer rule:** only the API writes `db/galleries/<gid>.json`, always
with `If-Match`. The processor writes only its own per-photo sidecar. That is why
50 photos can process in parallel without a lost update — there is no shared
document for them to race on.

**Content-addressed derivatives:** keys carry `_<rev>`, so everything under
`media/` is served `immutable` for a year and re-processing never needs an
invalidation. ZIPs are keyed by `sha1` of the exact photo revisions requested, so
asking twice costs one build.

---

## First deployment

### 0. Prerequisites

- `aws` CLI configured with the `bankall` profile
- Node 22+ and `npm install` run in the repo root (esbuild bundles the Lambdas)
- `openssl` and `python3` (used by `bootstrap.sh`)

No SAM CLI needed: `deploy.sh` uses `aws cloudformation package` + `deploy`,
which apply the SAM transform server-side.

### 1. Configure

```bash
cp infra/.env.deploy.example infra/.env.deploy
$EDITOR infra/.env.deploy          # leave CERTIFICATE_ARN empty for now
```

`infra/.env.deploy` is gitignored and holds no secrets — only names and ids.

### 2. Bootstrap the things CloudFormation must not hold

```bash
./infra/bootstrap.sh
```

This creates the artifacts bucket, generates the RSA-2048 CloudFront signing key
pair (private key → SSM `SecureString`), generates the two JWT secrets, and
prompts for the admin password (hashed with scrypt by the same module the Lambda
verifies with, so the format cannot drift).

Copy the three printed values into `infra/.env.deploy`.

### 3. Deploy without a certificate

```bash
./infra/deploy.sh --build
```

The stack comes up on its `*.cloudfront.net` domain. Everything — uploads,
watermarking, passwords, downloads — is fully testable there before any DNS
changes, which matters because `ankaastudio.fr` currently points at OVH.

### 4. Install the watermark and publish the site

```bash
./infra/upload-watermark.sh ~/path/to/logo.png     # PNG with transparency
npm run build && ./infra/sync-site.sh
```

The watermark is a single PNG at `assets/watermark.png` in the media bucket. The
processor scales it to 22% of each derivative's width. A missing watermark
degrades gracefully — galleries still process, just unmarked.

### 5. Try it

Open `https://<distribution>.cloudfront.net/admin`, log in, create a gallery,
drop in a few photos, set a password, publish, then open the client link.

---

## Moving `ankaastudio.fr` across

Do this only once step 5 passes.

```bash
# 1. Certificate — MUST be us-east-1 for CloudFront, whatever the stack region.
aws acm request-certificate \
  --domain-name ankaastudio.fr \
  --subject-alternative-names www.ankaastudio.fr \
  --validation-method DNS \
  --region us-east-1 --profile bankall

# 2. Add the printed CNAME validation records at OVH, then wait for ISSUED:
aws acm describe-certificate --certificate-arn <arn> \
  --region us-east-1 --profile bankall --query 'Certificate.Status'

# 3. Attach it.
echo 'CERTIFICATE_ARN=<arn>' >> infra/.env.deploy
./infra/deploy.sh

# 4. Only now: repoint the OVH records at the distribution domain.
#    A/AAAA ALIAS if OVH supports it for the apex, otherwise CNAME on www plus
#    an apex redirect.
```

The distribution keeps answering on `*.cloudfront.net` throughout, so the cutover
is reversible at the DNS layer.

### GitHub Actions

The `site` job runs on every push to `main` and needs
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`,
`CLOUDFRONT_DISTRIBUTION_ID`.

The `stack` job is `workflow_dispatch` only (tick *deploy_stack*) and additionally
needs `ARTIFACTS_BUCKET`, `STACK_NAME`, `MEDIA_BUCKET`, `DOMAIN_NAME`,
`CERTIFICATE_ARN`, `KEY_GROUP_ID`, `CF_KEY_PAIR_ID`, `SENDER_EMAIL`.

Note the invalidation is scoped to the four entry documents. A `/*` invalidation
would also evict every cached photo — a needless bill and a slow gallery for the
next visitor.

---

## Operating it

**Change the admin password** — no redeploy, the Lambda reads SSM on cold start:

```bash
./infra/bootstrap.sh password
```

**Re-watermark an existing gallery** — change the mode in the editor, then press
*Régénérer les aperçus*. This bumps every photo's `rev`, so new URLs are served
immediately with no invalidation, and old derivatives are deleted only after the
new ones are queued.

**A batch of uploads that never finished** (tab closed mid-upload) — press
*Actualiser* in the editor. `reconcile` folds in every sidecar it finds and
re-queues any original that never produced one.

**Cost.** CloudFront's perpetual free tier covers 1 TB/month egress and 10 M
requests, which is the entire reason for putting everything behind one
distribution. Realistically the bill is S3 storage plus a few cents of Lambda:
originals move to `GLACIER_IR` after 30 days and cached ZIPs expire after 30 days
(tag-driven, `ankaa-kind=zip`).

**Where things are:**

```
db/index.json                        gallery list (admin list view)
db/galleries/<gid>.json              the record — API writes, If-Match always
db/galleries/<gid>/photos/<pid>.json processor sidecars
db/selections/<gid>.json             client favourites
db/jobs/<jid>.json                   ZIP job progress
db/zips/<gid>/<hash>.json            built-archive marker (parts list)
originals/<gid>/<pid>.<ext>          untouched uploads → GLACIER_IR at 30 days
media/g/<gid>/v/t|w/<pid>_<rev>.webp previews (signed cookies)
media/g/<gid>/d/hd/<pid>_<rev>.jpg   HD downloads (signed URLs)
media/g/<gid>/d/zip/<hash>.zip       cached archives (expire at 30 days)
assets/watermark.png                 the mark
```

### Troubleshooting

| Symptom                                   | Cause                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Previews 403 in the browser               | Signed cookies expired or the wrong `Path`. Reload — the manifest re-signs on every read. |
| Photos stuck on "traitement…"             | Check the `ankaa-gallery-processor` log group; then press *Actualiser*. |
| ZIP job reports `failed`                  | Check `ankaa-gallery-zipper` logs; the DLQ `ankaa-gallery-zipper-dlq` holds the payload. |
| `409 Modification concurrente`            | Two admin tabs wrote at once. The retry is automatic; a visible 409 means it lost six times. |
| Share email not delivered                 | SES sandbox — verify the recipient, or request production access.       |
| Admin login always fails after bootstrap  | `admin-password` SSM parameter written under a different `SsmPrefix` than the stack uses. |
| `index.handler is undefined` at runtime   | The `{ "type": "commonjs" }` marker `build.sh` writes into each `build/<fn>/` is missing, so Node reads the repo root's `"type": "module"` and parses the CJS bundle as ESM. |
