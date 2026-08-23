import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In production the site, the API and the media all answer on one hostname:
// CloudFront routes /api/* to the gallery Lambda's function URL and /media/* to
// the media bucket. `npm run dev` serves only the site, so both paths are
// proxied to the deployed distribution.
//
// A proxy rather than absolute URLs in the client, because calling the API
// directly from the browser cannot work:
//   · the function URL is AuthType AWS_IAM — only CloudFront's origin access
//     control can sign for it, and the browser has no credentials to sign with;
//   · the API's sessions are HttpOnly SameSite cookies, and CloudFront's signed
//     cookies are scoped to the origin serving the media, so anything
//     cross-origin loses both.
//
// Point DEV_ORIGIN at another distribution (or at https://ankaastudio.fr) in
// .env to develop against something else.
const DEV_ORIGIN = "https://d1a2rafbxikrle.cloudfront.net";

/** One proxy entry per path; a fresh object each time, as Vite mutates them. */
function proxyTo(target) {
	return {
		target,
		// CloudFront answers 403 to a Host it does not serve, so the viewer Host
		// has to become the distribution's. The edge function forwards it to the
		// API as x-ankaa-host, which is what scopes the signed cookies — hence the
		// media paths in every response must stay relative, or the browser would
		// go straight to CloudFront without the cookies it just received.
		changeOrigin: true,
		configure: proxy => {
			proxy.on("proxyRes", proxyRes => {
				const cookies = proxyRes.headers["set-cookie"];

				// Every cookie the API sets is Secure, and http://localhost is only
				// treated as a secure context by some browsers. Dropping the flag on
				// the way back keeps dev working in all of them.
				if (cookies) {
					proxyRes.headers["set-cookie"] = cookies.map(cookie => cookie.replace(/;\s*Secure/gi, ""));
				}
			});
		}
	};
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	// Prefix "" so plain (non-VITE_) names are readable here without leaking into
	// the client bundle.
	const target = loadEnv(mode, process.cwd(), "").DEV_ORIGIN || DEV_ORIGIN;

	return {
		plugins: [react()],
		server: {
			proxy: {
				"/api": proxyTo(target),
				"/media": proxyTo(target),
				// The Instagram feed is a static document in the media bucket, served
				// on its own public /instagram/* behaviour; proxy it like the rest.
				"/instagram": proxyTo(target)
			}
		},
		build: {
			outDir: "dist"
		}
	};
});
