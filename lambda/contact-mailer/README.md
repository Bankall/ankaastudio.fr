# Contact mailer Lambda

Receives the Ankaa Studio contact form (JSON) and sends an email to
`sophie.marache@gmail.com` through **Amazon SES v2**.

## Payload

```json
{
	"name": "Jane Doe",
	"email": "jane@example.com",
	"service": "Séance chien",
	"message": "Bonjour, je souhaite réserver..."
}
```

A hidden `website` / `company` field is treated as a honeypot: if filled, the
request is accepted (`200`) but no email is sent.

## Anti-abuse

Two layers protect the form:

1. **Honeypot** — a hidden `website` field bots tend to fill; if set, the request
   is silently accepted without sending.
2. **Google reCAPTCHA Enterprise** (score-based) — the frontend attaches a
   `recaptchaToken`, and the Lambda validates it by creating an *assessment* via
   the reCAPTCHA Enterprise API. Requests below `RECAPTCHA_MIN_SCORE` (default
   `0.5`), with an invalid token, or with the wrong action are rejected with `400`.

reCAPTCHA is **opt-in**: it only runs when `RECAPTCHA_PROJECT_ID`,
`RECAPTCHA_SITE_KEY`, and `RECAPTCHA_API_KEY` are all set — otherwise the Lambda
skips the check (handy for local testing).

See **[Setting up reCAPTCHA Enterprise](#setting-up-recaptcha-enterprise)** below
for the full click-by-click walkthrough of the Google Cloud console.

## How it forwards

The Lambda sends every message **from** `contact@ankaastudio.fr` **to**
`sophie.marache@gmail.com`, and sets the visitor's address as **`Reply-To`**.
So Sophie just hits "Reply" in Gmail and the answer goes straight to the visitor.

## Prerequisites (SES)

1. In the SES console (region `eu-west-1` or your choice — must match `AWS_REGION`), **verify the sender
   identity** used in `SENDER_EMAIL` — either the address `contact@ankaastudio.fr`
   or, recommended, the whole `ankaastudio.fr` domain with DKIM (better
   deliverability, passes DMARC). This requires adding records to the
   `ankaastudio.fr` DNS.
2. If your SES account is still in the **sandbox**, also verify the recipient
   `sophie.marache@gmail.com` (create an email identity and click the confirmation
   link in that inbox), or request production access to remove that limit.

## Environment variables

| Variable          | Default                        | Notes |
|-------------------|--------------------------------|-------|
| `RECIPIENT_EMAIL` | `sophie.marache@gmail.com`     | Where the form is delivered. |
| `SENDER_EMAIL`    | `contact@ankaastudio.fr`       | Must be an SES-verified identity (address or domain). |
| `ALLOWED_ORIGINS` | `https://ankaastudio.fr`       | Comma-separated CORS allow-list. |
| `AWS_REGION`      | (set by Lambda)                | SES region. |
| `RECAPTCHA_PROJECT_ID`| (unset — check disabled)   | Google Cloud project id that owns the reCAPTCHA key. |
| `RECAPTCHA_SITE_KEY`| (unset — check disabled)     | reCAPTCHA Enterprise key. Same value as `VITE_RECAPTCHA_SITE_KEY`. |
| `RECAPTCHA_API_KEY`| (unset — check disabled)      | Google Cloud API key authorized for the reCAPTCHA Enterprise API. |
| `RECAPTCHA_MIN_SCORE` | `0.5`                      | Minimum score to accept (0.0 bot .. 1.0 human). |
| `RECAPTCHA_ACTION`| `contact`                      | Expected action name; must match the frontend. |

> All three of `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_SITE_KEY`, and
> `RECAPTCHA_API_KEY` must be present for the check to run.

## AWS setup (one time)

You need the AWS CLI installed and the **`bankall`** profile configured
(`aws configure --profile bankall`, or an entry in `~/.aws/credentials`). Verify:

```bash
aws sts get-caller-identity --profile bankall
```

### 1. Create the execution role

The Lambda runs under an IAM role that grants it (a) permission to write logs and
(b) permission to send mail through SES. Create it once:

```bash
# Trust policy: allow Lambda to assume the role.
cat > trust-policy.json <<'JSON'
{
	"Version": "2012-10-17",
	"Statement": [
		{ "Effect": "Allow", "Principal": { "Service": "lambda.amazonaws.com" }, "Action": "sts:AssumeRole" }
	]
}
JSON

aws iam create-role \
	--role-name ankaa-contact-mailer-role \
	--assume-role-policy-document file://trust-policy.json \
	--profile bankall

# Basic logging (CloudWatch).
aws iam attach-role-policy \
	--role-name ankaa-contact-mailer-role \
	--policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
	--profile bankall

# Permission to send email via SES.
cat > ses-policy.json <<'JSON'
{
	"Version": "2012-10-17",
	"Statement": [
		{ "Effect": "Allow", "Action": "ses:SendEmail", "Resource": "*" }
	]
}
JSON

aws iam put-role-policy \
	--role-name ankaa-contact-mailer-role \
	--policy-name ankaa-ses-send \
	--policy-document file://ses-policy.json \
	--profile bankall
```

Grab the role ARN (goes into `.env.deploy` as `ROLE_ARN`):

```bash
aws iam get-role --role-name ankaa-contact-mailer-role \
	--query 'Role.Arn' --output text --profile bankall
```

### 2. Verify SES identities

See the [Prerequisites (SES)](#prerequisites-ses) section above — verify the
sender (and, in sandbox, the recipient) before the first real send.

## Deploy

Configuration lives in **`.env.deploy`** (gitignored) so no secrets end up in the
CLI history or the repo. Set it up once:

```bash
cd lambda/contact-mailer
cp .env.deploy.example .env.deploy
# edit .env.deploy: profile, region, ROLE_ARN, emails, reCAPTCHA keys
```

Then the whole flow is two npm one-liners (run from `lambda/contact-mailer/`):

```bash
npm run deploy   # first run creates the function; later runs update code + env
npm run update   # fast path: pushes code changes only, skips the env update
```

`npm run deploy` auto-detects whether the function already exists: it **creates**
it the first time (using `ROLE_ARN`), and on subsequent runs **updates both the
code and the environment variables** from `.env.deploy`. Use `npm run update`
while iterating on `index.mjs` when the config hasn't changed — it's faster.

The `@aws-sdk/*` packages ship with the Node.js 22 Lambda runtime, so the deploy
just zips `index.mjs` — no `npm install` or bundling needed.

## Expose over HTTP

Attach a **Lambda Function URL** (simplest) or an **API Gateway HTTP API**.
Use the same profile/region as `.env.deploy` (`eu-west-1` by default):

```bash
aws lambda create-function-url-config \
	--function-name ankaa-contact-mailer \
	--auth-type NONE \
	--cors "AllowOrigins=https://ankaastudio.fr,AllowMethods=POST,AllowHeaders=content-type" \
	--profile bankall \
	--region eu-west-1

# Allow public (unauthenticated) invocation of the Function URL.
# NOTE: this account requires BOTH permissions below. The AWS docs commonly
# show only InvokeFunctionUrl, but if the Lambda console shows a banner like
# "auth type is NONE, but is missing permissions required for public access",
# you also need the InvokeFunction grant — otherwise every call returns 403.
aws lambda add-permission \
	--function-name ankaa-contact-mailer \
	--statement-id FunctionURLAllowPublicAccess \
	--action lambda:InvokeFunctionUrl \
	--principal "*" \
	--function-url-auth-type NONE \
	--profile bankall \
	--region eu-west-1

aws lambda add-permission \
	--function-name ankaa-contact-mailer \
	--statement-id FunctionURLAllowPublicInvoke \
	--action lambda:InvokeFunction \
	--principal "*" \
	--profile bankall \
	--region eu-west-1
```

Then set the returned URL as `VITE_CONTACT_ENDPOINT` in the frontend build.
Verify public access with a quick anonymous call — a `400` "vérification
anti-spam" response means it's reaching the code (a `403` means the permissions
above are missing):

```bash
curl -i -X POST <FUNCTION_URL> \
	-H 'Content-Type: application/json' \
	-d '{"name":"T","email":"t@e.com","service":"T","message":"hi"}'
```

## Setting up reCAPTCHA Enterprise

reCAPTCHA Enterprise lives in the **Google Cloud** console (not the old
`recaptcha/admin` page used by v3). It's free under a monthly quota (currently up
to 10,000 assessments/month), which is far more than a contact form needs. Follow
these steps once.

### 1. Create / pick a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with your Google account.
2. In the top bar, click the **project selector** (says "Select a project") →
   **New Project**. Name it e.g. `ankaa-studio` and click **Create**.
3. Once created, make sure it's selected in the top bar. Note the **Project ID**
   (looks like `ankaa-studio-433812`) — this is your `RECAPTCHA_PROJECT_ID`.

> A Cloud project needs a billing account attached even to use free quota. If you
> haven't set one up, the console will prompt you (**Billing** → link a card).
> You won't be charged under the free tier.

### 2. Enable the reCAPTCHA Enterprise API

1. In the search bar type **"reCAPTCHA Enterprise API"** and open it.
2. Click **Enable**. (This also happens automatically when you create your first
   key, but doing it explicitly avoids a first-request error.)

### 3. Create a reCAPTCHA key (the site key)

1. Navigate to **Security → reCAPTCHA** (or search **"reCAPTCHA Enterprise"** and
   open **Keys**).
2. Click **Create key**.
3. Fill in:
   - **Display name**: `ankaastudio-contact`
   - **Platform type**: **Website**
   - **Domains**: add `ankaastudio.fr`. Add `www.ankaastudio.fr` too if you use it,
     and `localhost` while developing.
   - **Use checkbox challenge**: leave **OFF** — you want the invisible,
     score-based flow (equivalent to the old v3).
4. Click **Create**. The console shows a **key id** — a long string like
   `6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. That is your **site key**, used for both
   `VITE_RECAPTCHA_SITE_KEY` (frontend) and `RECAPTCHA_SITE_KEY` (Lambda).

### 4. Create an API key (to call createAssessment from the Lambda)

The Lambda authenticates to the assessment endpoint with a Google Cloud **API
key** (simpler than a service-account JSON in Lambda).

1. Go to **APIs & Services → Credentials**.
2. Click **Create credentials → API key**. Copy the generated key — this is your
   `RECAPTCHA_API_KEY`.
3. Click **Edit** on the new key and lock it down:
   - **API restrictions** → **Restrict key** → select **reCAPTCHA Enterprise API**.
     This ensures the key can *only* create assessments, nothing else.
   - Leave application restrictions as **None** (the call comes from Lambda, whose
     egress IP isn't fixed). The API restriction above is what keeps it safe.
4. Click **Save**.

### 5. Wire the values in

- **Frontend build** (e.g. `.env` / CI): `VITE_RECAPTCHA_SITE_KEY=<site key>`
- **Lambda env vars**:
  - `RECAPTCHA_PROJECT_ID=<project id from step 1>`
  - `RECAPTCHA_SITE_KEY=<site key from step 3>`
  - `RECAPTCHA_API_KEY=<api key from step 4>`

### 6. Verify it works

Submit the contact form on the deployed site, then in the Cloud console open
**Security → reCAPTCHA → your key → Metrics**. You should see the request appear
with a score. In CloudWatch, a rejected submission logs
`reCAPTCHA rejected: low-score 0.1` (or similar) so you can tune
`RECAPTCHA_MIN_SCORE`.

> Tip: reCAPTCHA Enterprise keys are regional-agnostic and unrelated to your AWS
> region — the Lambda just makes an HTTPS call to Google's global endpoint.
