// The visitor's email, remembered for this browser.
//
// Asked once and then reused: the address is only there to name a download in the
// photographer's feed and to send an archive link, so a prompt in front of every
// single tile would be a tax on the gallery for no gain.

const STORAGE_KEY = "ankaa_download_email";

export function readDownloadEmail() {
	try {
		return window.localStorage.getItem(STORAGE_KEY) ?? "";
	} catch {
		// Private browsing, or storage denied. Then it gets asked again — fine.
		return "";
	}
}

export function storeDownloadEmail(value) {
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		/* Nothing to do: the download itself does not depend on this. */
	}
}
