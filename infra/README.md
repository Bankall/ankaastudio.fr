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

| Path         | Origin                    | Access                                    |
| ------------ | ------------------------- | ----------------------------------------- |
| `/*`         | site bucket (OAC)         | public — the marketing site               |
| `/api/*`     | Lambda Function URL (OAC) | public route, own auth                    |
| `/gallery/*` | Lambda Function URL (OAC) | public — the SPA shell, per-gallery link preview tags injected |
| `/media/*`   | media bucket (OAC)        | signed cookies (previews) / signed URLs (downloads) |

The media bucket's policy only grants CloudFront `media/*`. `db/` (the JSON
database) and `originals/` are off the CDN by construction, not by configuration —
there is no CloudFront signature that can reach them. `originals/` has exactly one
door, and it is not CloudFront: a high-definition download is the uploaded file
itself, handed over as a 5-minute **presigned S3 GET** signed with the API
function's own role. `db/` has no door at all.

### Two access zones

- `media/g/<gid>/v/*` — watermarked previews. Covered by **signed cookies**
  scoped to `Path=/media/g/<gid>/v/`, so several gallery sessions coexist in one
  browser despite CloudFront's fixed cookie names. 12 h, renewed by the client.
  Two prefixes under it hold unmarked copies, both of the cover photo only, so a
  gallery never exposes more than one clean preview of one photo, and the API
  deletes both as soon as another photo becomes the cover: `v/c/` is the gallery's
  opening image, `v/s/` the JPEG a messaging app draws when the link is pasted
  into a conversation (see [Link previews](#link-previews)).
- `media/g/<gid>/d/*` — ZIPs, and the one kind of HD file that has to be derived:
  a photo whose watermark mode is `all` carries the mark in the download too, so
  that download cannot be the original. **Never** covered by a cookie; each one
  gets its own 5-minute signed URL from the API.

Everything else a client downloads is their original, presigned straight off
`originals/` — no re-encode, no second copy of the largest thing in the bucket, and
old galleries got it the day this shipped without regenerating anything. The
filename is set on the response rather than on the object, which is what makes that
true.

Download blocking is therefore not a UI toggle: with `downloadsEnabled: false` the
API signs nothing — no `d/` URL, no original — and nothing else can. A set may
narrow that (see [Sets](#sets)) but never widen it — the gallery's flag is checked
first, on every route that signs.

### Two things about the API origin that will bite you

The `/api/*` origin is a Lambda Function URL with `AuthType: AWS_IAM`, reached
through an origin access control that signs every origin request with SigV4.
Two consequences, both non-obvious and both already handled in this repo:

1. **CloudFront needs two IAM grants, not one.** `lambda:InvokeFunctionUrl` on
   its own deploys perfectly and then 403s every single request with
   *"Forbidden. For troubleshooting Function URL authorization issues"*.
   `lambda:InvokeFunction` is required as well — see `ApiUrlCloudFrontPermission`
   and `ApiInvokeCloudFrontPermission`.
2. **The browser must hash its own request bodies.** Lambda Function URLs reject
   unsigned payloads, and CloudFront will not hash a body it is streaming, so any
   `POST`/`PUT`/`PATCH` must carry `x-amz-content-sha256: <hex sha256 of body>`
   or the origin rejects the signature. `src/utils/galleryApi.js` computes it for
   every request. Anything new that talks to `/api/*` with a body must too.
   Plain `GET`s need nothing, which is why download links can stay ordinary
   browser navigations.

### The three Lambdas

| Function            | Trigger                     | Job                                                            |
| ------------------- | --------------------------- | -------------------------------------------------------------- |
| `ankaa-gallery-api` | CloudFront `/api/*`, `/gallery/*` | auth, gallery CRUD, presigned uploads, signing, SES sharing, the gallery page |
| `ankaa-gallery-processor` | async invoke from the API | sharp: watermarked previews, LQIP, per-photo sidecar (plus a marked HD JPEG under mode `all`) |
| `ankaa-gallery-zipper`    | async invoke from the API | streams a store-mode ZIP into S3 multipart                    |

**Single-writer rule:** only the API writes `db/galleries/<gid>.json`, always
with `If-Match`. The processor writes only its own per-photo sidecar. That is why
50 photos can process in parallel without a lost update — there is no shared
document for them to race on.

**Content-addressed derivatives:** keys carry `_<rev>`, so everything under
`media/` is served `immutable` for a year and re-processing never needs an
invalidation. ZIPs are keyed by `sha1` of the exact photo revisions requested,
each tagged with the file it was taken from (`<pid>_<rev>:original` for the upload
itself, a bare `<pid>_<rev>` for a marked HD JPEG, `<pid>_<rev>:web` for a photo
whose set has HD switched off and which therefore goes in as the watermarked
preview). So asking twice costs one build, flipping an HD switch can never serve
the wrong quality from cache, and one archive can mix all three — a favourites
selection spans sets that need not agree.

**The API sends the archive email, not the zipper.** A client asking for an
archive gives an email address (never verified — it is there to name the download
in the photographer's feed) and the API mails them `/archive/<jid>` *before* the
build starts: the zipper has neither a sender identity nor the CloudFront signing
key, and a signed URL lives five minutes, which is useless in an inbox. That page
polls `GET /api/archives/<jid>`, which sits outside the password gate — the mail is
opened on devices that never saw the gallery, so the 95-bit job id is the
credential. It still honours the gallery's own switches, so turning downloads off
retracts every link ever sent, and the job document expires after 7 days.

### Link previews

A gallery link is pasted into an RCS thread, a WhatsApp message, an Instagram DM.
Each of those fetches the page and reads its `<head>` to draw a card, and none of
them runs JavaScript — so the client-side `<Seo>` component is invisible to them
and every gallery used to unfurl as the same studio-wide sentence with no image.

Which is why `/gallery/*` is a CloudFront behaviour of its own, pointed at the API:
`lambda/gallery-api/src/routes/preview.mjs` reads the deployed `index.html`, strips
the studio's static card out of its head and writes that gallery's in — title,
photo count, shoot date, whether there is a password. Everything else about the
document is untouched, so the app boots exactly as before, and the response is
edge-cacheable by URL (5 min), which keeps the Lambda off the page-load path.

Three things worth knowing:

- **The card's image is a redirect.** `og:image` points at
  `/api/g/<slug>/preview`, which 302s to a freshly signed URL of `v/s/`. A crawler
  holds no signed cookies, and a signature written into the tag itself would be
  dead the day the message is forwarded; signing per fetch means the URL in the
  message never expires. If the JPEG has not been derived yet the redirect falls
  back to the watermarked `v/w/` preview, so there is always an image.
- **That image is public to anyone holding the link** — including for a
  password-protected gallery, whose gate the card therefore shows one photo past.
  That is the trade: a card with no photo is the thing being fixed here.
- **No `noindex` in the served head, deliberately.** Several of these crawlers
  refuse a page that carries one, and a gallery whose link cannot be previewed is
  the whole problem. `<Seo>` still sets it client-side, which is what Googlebot
  reads, and `robots.txt` must *not* grow a `Disallow: /gallery/` — the honest
  crawlers among them would then stop fetching and the cards would go back to
  being blank.

The API also derives that JPEG when the editor is opened, because a link usually
leaves through the copy button, which never reaches the API at all.

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
processor stretches it across 90% of each derivative's width, centred, at 60%
opacity: it is a download deterrent, not a signature, so it sits where it cannot
be cropped out. Supply something wide, short and opaque — the width ratio and the
opacity are constants in `lambda/gallery-processor/src/index.mjs`, so they can be
retuned without re-exporting artwork. A missing watermark degrades gracefully —
galleries still process, just unmarked.

The gallery cover is the exception: it is served from its own unmarked derivative,
which the API queues the first time a client opens the gallery. That very first
visit sees the marked preview; every one after it sees the clean image.

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

The `site` job runs on every push to `master` and needs two secrets,
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, plus `S3_BUCKET_NAME` and
`CLOUDFRONT_DISTRIBUTION_ID`. The region is not a secret; it is declared as
`AWS_REGION` in the workflow itself and mirrors `infra/.env.deploy`.

Those credentials belong to the `ankaa-github-deploy` IAM user, whose inline
policy allows only writes to the site bucket and invalidations on the one
distribution. CI therefore cannot deploy the stack, by design: that needs rights
to mint IAM roles and buckets. Run `./infra/deploy.sh` from a workstation for
infrastructure changes.

That policy is kept in `github-deploy-policy.json`. It is not applied by any
script — the user is created once, by hand — so if you edit the file, push it:

```bash
aws iam put-user-policy --user-name ankaa-github-deploy \
  --policy-name ankaa-site-deploy \
  --policy-document file://infra/github-deploy-policy.json --profile bankall
```

The bucket name, distribution id and account id are hardcoded in it, so it is
specific to this account rather than a reusable template.

Note the invalidation is scoped to the entry documents, `/gallery/*` among them:
those pages are `index.html` rendered by the API, so they carry the hashed asset
names the deploy just replaced. A `/*` invalidation would also evict every cached
photo — a needless bill and a slow gallery for the next visitor.

---

## Operating it

**Change the admin password** — no redeploy. The API caches SSM for five minutes,
so the new password works — and the old one stops — within that window:

```bash
./infra/bootstrap.sh password
```

**Re-watermark an existing gallery** — change the mode in the editor and accept the
regenerate it offers; *Régénérer les aperçus* (whole gallery) and ⟳ (one tab) do the
same thing on demand. Either way it bumps the `rev` of the photos in scope, so new
URLs are served immediately with no invalidation, old derivatives are deleted only
after the new ones are queued, and the cached ZIPs — keyed by `rev` — are dropped.

**A batch of uploads that never finished** (tab closed mid-upload) — press
*Actualiser* in the editor. `reconcile` folds in every sidecar it finds and
re-queues any original that never produced one.

### Sets

A set is a named group of photos inside a gallery, shown to the client as a tab
with its own download switches and its own watermark. They live on the record as
`sets: [{ id, title, downloadsEnabled, hdEnabled, watermark }]` — the array *is* the
tab order — and a photo belongs to one through its own `setId`.

Nothing needed migrating and nothing needs creating: `setId: null` means the photo
is served under `gallery.ungrouped`, a `{ downloadsEnabled, hdEnabled, watermark }`
triple whose defaults are what every photo got before sets existed. The API always sends the
client at least one group, so a gallery with no sets is simply a gallery with one
unnamed set, and the tab bar does not render.

Consequences worth knowing:

- **The gallery's `downloadsEnabled` is the master switch, and now only that.** A
  set's own flag can only close what the gallery has opened, and so can the
  remainder's — which is why the ungrouped photos have a pair of their own rather
  than borrowing the master. While they shared it, closing downloads for the loose
  photos closed them for every set too, which is the state a gallery is in right
  after its first upload. Records written before that split keep `hdEnabled` at the
  top level; `ungroupedSettings()` reads it as the remainder's until the first save
  of those switches replaces it.
- **A set's `watermark` is `null` unless it overrides the gallery's.** `watermarkFor()`
  resolves a tab's own mode, then `gallery.watermark`, and the mode is *burnt into*
  the derivatives — so it only reaches photos derived after it is set. The admin
  offers a scoped reprocess (`POST /reprocess` with `{ setId }`) as soon as the mode
  changes, which is what takes a mark off — or puts one on — the photos already there.
- **`all` is the only mode that changes what a download *is*.** Under `preview` and
  `none`, an HD download is the uploaded file presigned off `originals/`, so there is
  nothing to derive and nothing to regenerate. Under `all` the mark has to be inside
  the file the client keeps, which no original can be: the processor derives a
  full-size marked JPEG (`media/g/<gid>/d/hd/`) and that is what gets signed. The
  choice is read off `photo.watermark` — the mode the file on S3 was actually made
  under — never off the tab's current setting, so a mode changed a minute ago cannot
  make a download 404 or quietly drop a mark.
- **A photo that changes tab is re-derived when its effective mode changes.**
  `PATCH /photos` with `sets` and `DELETE /sets/<sid>` both compare
  `photoWatermark()` before and after the move and requeue only the `ready` photos
  whose answer differs, so a photo cannot sit in a tab wearing another tab's mark.
  Photos left `processing` or `archived` are skipped; the reconcile that thaws them,
  or ⟳, catches them up.
- **Deleting a set never deletes photographs.** Its photos go back to `setId:
  null`, i.e. to `gallery.ungrouped` — including its watermark, per the point above.
  Sets are created empty for the same reason — creating and deleting one are both
  cheap and reversible.
- **HD off does not mean no archive.** Those photos go into the ZIP as the same
  watermarked preview the tiles hand over, which is why an archive can be mixed.
- **A set's photos are not a separate order.** The record keeps one flat photo
  order and the tabs slice it, so the admin grid only reorders within a block.
- **Archive links are re-checked per set.** The job document records the `setIds`
  it drew from, and both `GET /api/jobs/<jid>` and the emailed
  `GET /api/archives/<jid>` refuse to re-sign once any of them has downloads
  switched off — so retracting a link is per set, not only per gallery.
- **A dangling `setId`** (a set deleted by another admin tab mid-edit) degrades to
  the ungrouped group rather than to an invisible photo: the client manifest sends
  the group each photo was actually placed in.

### Archiving a gallery

Setting a gallery to **Archivée** is a real archive, not a visibility flag. It
throws away every byte that can be rebuilt and parks the rest as cheaply as S3
allows — around 3 % of the storage cost of a live gallery.

What happens, in this order (`updateGallery` in `routes/admin.mjs`):

1. Every photo's `status` becomes `archived` and the record is saved **first**, so
   all client routes answer `410` before a single file disappears. Nothing else on
   the entry is cleared — `pid`, `rev`, extension, original filename, caption and
   order are exactly what a rebuild needs.
2. `purgeDerivatives` deletes `media/g/<gid>/` (previews, unmarked cover, HD, cached
   ZIPs), the processor sidecars under `db/galleries/<gid>/photos/`, and the built-archive
   markers under `db/zips/<gid>/`. The sidecars have to go too: `reconcile` folds any
   sidecar it finds back into the record, so one left behind would flip an archived
   photo to `ready` pointing at a derivative that no longer exists.
3. `freezeOriginals` tags each original `ankaa-state=archived`, which is what the
   `archived-originals-to-deep-archive` lifecycle rule matches on. S3 moves them to
   `DEEP_ARCHIVE` on its next daily pass.

**Why a tag and a lifecycle rule rather than a copy.** By the time a gallery is
archived its originals are usually already in `GLACIER_IR`, and rewriting an object
in place is billed as a *retrieval of every byte* — about $0.03/GB, so ~$61 for 2 TB.
A lifecycle transition is billed per object instead, a few cents for the same set.
Lifecycle prefixes cannot wildcard and the `<gid>` sits in the middle of
`originals/<gid>/<pid>.<ext>`, so per-gallery selection has to go through
`TagFilters` — the same trick the `expire-zip-cache` rule already uses. The rule's
`TransitionInDays: 1` is counted from *object creation*, not from when the tag was
applied, so for anything older than a day it means "at the next pass".

Both steps run unconditionally on every save of an archived gallery rather than
only on the transition. That is what makes them idempotent: a run cut short by a
Lambda timeout is finished by the next save, instead of leaving orphaned
derivatives to bill in silence. `freezeOriginals` skips objects already in
`DEEP_ARCHIVE`, so the repeat costs one LIST.

**Getting a gallery back.** Move it out of *Archivée*, then press *Régénérer les
aperçus* once the originals are readable:

- Leaving archive calls `thawOriginals` — it removes the tag and issues a
  `RestoreObject` at the **Bulk** tier (`Days: 7`). Bulk takes up to **48 hours** and
  costs about an eighth of the 12-hour Standard tier.
- *Régénérer* refuses while anything is still frozen and tells you how many. It also
  *starts* the restore itself if it finds untouched objects, so pressing it is enough
  even if the status change was missed.
- A restore is a temporary readable copy, **not** a move: the object stays in
  `DEEP_ARCHIVE`, and the copy expires after 7 days. Removing the tag does not bring
  anything back on its own — lifecycle transitions only ever go one way. Re-deriving
  later than the window means paying for another restore.
- Restore state is read with one `ListObjectsV2` per gallery using
  `OptionalObjectAttributes: ["RestoreStatus"]`, not a `HeadObject` per photo.

**Uploading into an archived gallery** is allowed and stays archived. Nothing is
derived — `processPhotos` records the photo with `status: "archived"` and queues no
processor, because deriving would rebuild exactly what archiving deleted, into a
gallery that answers 410, from an original that is not readable. Instead the
presigned POST carries `x-amz-storage-class: DEEP_ARCHIVE`, so the object lands in
Deep Archive directly: no transition request to pay for, and no window where a
supposedly archived gallery is billed at `STANDARD`. `createPresignedPost` turns
every `Fields` entry into an exact-match policy condition, so an upload that omits
the field gets a 403 rather than silently costing full rate. These photos are
listed, ordered and captioned like any other and get derived along with the rest
when the gallery comes back.

*Actualiser* (`reconcile`) is archive-aware for the same reason: archived photos are
carried over rather than rebuilt from sidecars — there are none, by design, and a
rebuild from sidecars alone would empty the photo list and strand the originals with
nothing describing them. An original it finds with no record entry is adopted as
`archived` instead of queued. *Régénérer les aperçus* refuses outright while the
gallery is still archived.

**Minimum-duration charges.** `DEEP_ARCHIVE` bills a minimum of 180 days and
`GLACIER_IR` 90, so archiving and immediately un-archiving still pays out the
remainder. Archive because a gallery is done, not to park it for a week.

**Cost.** CloudFront's perpetual free tier covers 1 TB/month egress and 10 M
requests, which is the entire reason for putting everything behind one
distribution. Realistically the bill is S3 storage plus a few cents of Lambda:
originals move to `GLACIER_IR` after 60 days, archived originals continue to
`DEEP_ARCHIVE` (tag-driven, `ankaa-state=archived`), and cached ZIPs expire after
30 days (tag-driven, `ankaa-kind=zip`, scoped to `media/g/`). For scale: 2 TB of
originals is roughly $22/month live and $2/month fully archived. Derivatives are the
one thing with no lifecycle rule — they sit in `STANDARD` for as long as the gallery
does, which is a large part of why archiving deletes them; marked HD JPEGs are the
heavy ones at ~26 % of an original each, and only tabs set to `all` have any.

Serving originals is the one thing that does *not* ride the free tier: a presigned
GET and the zipper both read S3 directly, at ~$0.09/GB egress instead of
CloudFront's first free terabyte, and an original past 60 days is in `GLACIER_IR`,
which adds ~$0.03/GB retrieval. That is the price of a download that is genuinely
the photographer's file: a 40 MB original costs about half a cent to hand over, and
the alternative was re-encoding every one of them and storing the copy forever.

Photos derived *before* that changed still have an unmarked `d/hd/*.jpg` sitting in
`STANDARD`. Nothing serves them any more — the new fingerprint hashes `:original`
separately, so no cached archive is served from the old ones either — and each goes
the first time its photo is re-derived, deleted or archived. ⟳ on a tab reclaims them
immediately; otherwise they cost ~26 % of the originals they came from until then.

**Where things are:**

```
db/index.json                        gallery list (admin list view)
db/galleries/<gid>.json              the record — API writes, If-Match always
db/galleries/<gid>/photos/<pid>.json processor sidecars
db/selections/<gid>.json             client favourites
db/jobs/<jid>.json                   ZIP job progress (expires at 7 days)
db/zips/<gid>/<hash>.json            built-archive marker (parts list)
db/downloads.json                    download notifications, capped at 300
originals/<gid>/<pid>.<ext>          untouched uploads — and the HD download itself
                                     (presigned S3 GET) → GLACIER_IR at 60 days,
                                     → DEEP_ARCHIVE once tagged ankaa-state=archived
media/g/<gid>/v/t|w/<pid>_<rev>.webp previews (signed cookies)
media/g/<gid>/v/c/<pid>_<rev>.webp   unmarked cover, one per gallery
media/g/<gid>/d/hd/<pid>_<rev>.jpg   marked HD downloads, mode `all` only (signed URLs)
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
| Share email not delivered                 | `SENDER_EMAIL` is not a verified SES identity: `aws sesv2 create-email-identity --email-identity contact@ankaastudio.fr --profile bankall`. (This account already has SES production access, so recipients do *not* need verifying.) |
| Admin login always fails after bootstrap  | `admin-password` SSM parameter written under a different `SsmPrefix` than the stack uses. |
| `index.handler is undefined` at runtime   | The `{ "type": "commonjs" }` marker `build.sh` writes into each `build/<fn>/` is missing, so Node reads the repo root's `"type": "module"` and parses the CJS bundle as ESM. |
| Every `/api/*` call 403s with *"Forbidden … Function URL authorization"* | CloudFront is missing the `lambda:InvokeFunction` grant. `InvokeFunctionUrl` alone is not enough. |
| Only `POST`/`PATCH` 403 with *"signature we calculated does not match"* | The caller omitted `x-amz-content-sha256`, or sent a hash that does not match the body it actually sent. |
| `ReservedConcurrentExecutions … below its minimum value of [10]` | A new AWS account's total concurrency quota is 10, so nothing can be reserved. Keep `PROCESSOR_RESERVED_CONCURRENCY=0` until the quota is raised. |
| Zipper: `Body Data is unsupported format` | `archiver` is built on `readable-stream` v4, so it is *not* an instance of `node:stream`'s `Readable` and `lib-storage` refuses it. It must be piped through a real `PassThrough`. |
| Zipper: `not authorized to perform: s3:PutObjectTagging` | SAM's `S3CrudPolicy` does not cover tagging, but the archive upload sets `ankaa-kind=zip` for the lifecycle rule. See the extra statement on `GalleryZipperFunction`. |
| A new watermark or admin password seems to be ignored | Both are cached for 5 minutes per warm container. Wait it out; nothing needs redeploying. |
| API: `not authorized to perform: s3:PutObjectTagging` / `s3:RestoreObject` | Same gap as the zipper: `S3CrudPolicy` covers neither tagging nor restores, and archiving needs both. See the extra statement on `GalleryApiFunction`. |
| *Régénérer* on an un-archived gallery keeps reporting originals in restoration | Bulk restores take up to 48 h. Check one object: `aws s3api head-object --bucket ankaa-media --key originals/<gid>/<pid>.jpg --profile bankall` — `Restore: ongoing-request="true"` means it is still working. |
| An archived gallery's photos never come back after *Régénérer* | The 7-day restore window expired before the rebuild ran. The objects are still in `DEEP_ARCHIVE`; flip the status out of archive again to issue a fresh restore. |
| Uploads to an archived gallery 403 at S3 with *"Policy Condition failed: x-amz-storage-class"* | The browser dropped the field. `uploadToS3` forwards every entry of `presigned.fields` verbatim — if it stops doing so, uploads to archived galleries fail closed rather than landing in `STANDARD`. |
| Archived originals are still shown as `GLACIER_IR` | The lifecycle rule runs once a day and is counted from object creation. Confirm the tag landed: `aws s3api get-object-tagging --bucket ankaa-media --key originals/<gid>/<pid>.jpg --profile bankall`. |
| Uploads fail with *"No 'Access-Control-Allow-Origin' header"* on `ankaa-media.s3…` | The uploader POSTs a presigned form straight to S3, so it is the one cross-origin call in the system and the only thing the bucket's `CorsConfiguration` exists for. Serving the admin from a host that is not in `AllowedOrigins` breaks uploads and nothing else. `http://localhost:5173` is allowed by default (`DevUploadOrigin`); another dev port needs `DEV_UPLOAD_ORIGIN` in `infra/.env.deploy` and a redeploy. |
