// Minimal Google reCAPTCHA Enterprise (score-based) helper.
// Set VITE_RECAPTCHA_SITE_KEY to enable; when unset, getRecaptchaToken() resolves
// to an empty string and the Lambda check is effectively skipped (dev mode).

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let scriptPromise = null;

function loadScript() {
	if (!SITE_KEY) {
		return Promise.resolve(null);
	}

	if (scriptPromise) {
		return scriptPromise;
	}

	scriptPromise = new Promise((resolve, reject) => {
		if (window.grecaptcha?.enterprise) {
			resolve(window.grecaptcha.enterprise);
			return;
		}

		const script = document.createElement("script");
		// Enterprise uses enterprise.js (not api.js).
		script.src = `https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve(window.grecaptcha?.enterprise);
		script.onerror = () => {
			scriptPromise = null;
			reject(new Error("Failed to load reCAPTCHA Enterprise"));
		};
		document.head.appendChild(script);
	});

	return scriptPromise;
}

// Preload the reCAPTCHA script (call on mount so it's ready before submit).
export function preloadRecaptcha() {
	loadScript().catch(() => {});
}

// Resolve a fresh token for the given action, or "" when reCAPTCHA is disabled.
export async function getRecaptchaToken(action = "contact") {
	if (!SITE_KEY) {
		return "";
	}

	const enterprise = await loadScript();
	if (!enterprise) {
		return "";
	}

	return new Promise((resolve, reject) => {
		enterprise.ready(() => {
			enterprise.execute(SITE_KEY, { action }).then(resolve, reject);
		});
	});
}
