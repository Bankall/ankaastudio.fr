import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { adminApi } from "../utils/galleryApi.js";
import { AdminLogin } from "./AdminLogin.jsx";
import { DownloadFeed } from "./DownloadFeed.jsx";
import { GalleryEditor } from "./GalleryEditor.jsx";
import { GalleryList } from "./GalleryList.jsx";

/**
 * Session shell for the admin area.
 *
 * The gate here is cosmetic — every API route checks the signed cookie itself.
 * This only decides whether to render the login form or the app.
 */
export function AdminApp() {
	const [authenticated, setAuthenticated] = useState(null);

	const check = useCallback(() => {
		adminApi
			.session()
			.then(() => setAuthenticated(true))
			.catch(() => setAuthenticated(false));
	}, []);

	useEffect(check, [check]);

	const logout = async () => {
		try {
			await adminApi.logout();
		} finally {
			setAuthenticated(false);
		}
	};

	return (
		<div className='admin-shell'>
			<Seo title='Administration | Ankaa Studio' description='Administration des galeries privées Ankaa Studio.' path='/admin' noIndex />

			{authenticated === null ?
				<p className='admin-empty'>Vérification de la session…</p>
			: authenticated ?
				<>
					<nav className='admin-nav'>
						<span className='admin-nav__brand'>Ankaa Studio · Galeries</span>
						<div className='admin-nav__tools'>
							<DownloadFeed />
							<button type='button' className='admin-nav__logout' onClick={logout}>
								Se déconnecter
							</button>
						</div>
					</nav>

					<main className='admin-main'>
						<Routes>
							<Route index element={<GalleryList />} />
							<Route path='galleries/:gid' element={<GalleryEditor />} />
							<Route path='*' element={<Navigate to='/admin' replace />} />
						</Routes>
					</main>
				</>
			:	<AdminLogin onAuthenticated={() => setAuthenticated(true)} />}
		</div>
	);
}
