// The visitor's email, remembered for this browser.
//
// Asked once and then reused: it names a download in the photographer's feed, it is
// where an archive link is sent, and — since a gallery link is shared between
// everyone who was photographed — it is what tells one person's favourites from
// another's. A prompt in front of every single tile would be a tax on the gallery
// for no gain.
//
// The storage key is the one downloads have always used: it is the same address, and
// changing the key would ask every returning client for it again.

const STORAGE_KEY = "ankaa_download_email";

export function readVisitorEmail() {
	try {
		return window.localStorage.getItem(STORAGE_KEY) ?? "";
	} catch {
		// Private browsing, or storage denied. Then it gets asked again — fine.
		return "";
	}
}

export function storeVisitorEmail(value) {
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		/* Nothing to do: neither the download nor the favourite depends on this. */
	}
}
