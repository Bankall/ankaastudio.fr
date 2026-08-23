import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { SiteFooter } from "./components/SiteFooter.jsx";
import { SiteHeader } from "./components/SiteHeader.jsx";
import { ScrollToTop } from "./components/ScrollToTop.jsx";
import { AboutPage } from "./pages/AboutPage.jsx";
import { ContactPage } from "./pages/ContactPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { PortfolioPage } from "./pages/PortfolioPage.jsx";
import { PricingPage } from "./pages/PricingPage.jsx";
import { CgvPage } from "./pages/CgvPage.jsx";

// Client galleries and the admin area are lazy: neither is ever visited by a
// marketing-site visitor, and they should not weigh on the landing page bundle.
const GalleryPage = lazy(() => import("./gallery/GalleryPage.jsx").then(module => ({ default: module.GalleryPage })));
const ArchivePage = lazy(() => import("./gallery/ArchivePage.jsx").then(module => ({ default: module.ArchivePage })));
const AdminApp = lazy(() => import("./admin/AdminApp.jsx").then(module => ({ default: module.AdminApp })));

function ChunkFallback() {
	return <p className='route-fallback'>Chargement…</p>;
}

function LegacyGalleryRedirect() {
	const { slug } = useParams();

	return <Navigate to={`/gallery/${slug}`} replace />;
}

function Layout() {
	return (
		<div className='app-shell'>
			<SiteHeader />
			<main id='main-content'>
				<Outlet />
			</main>
			<SiteFooter />
		</div>
	);
}

function StaticRouteBridge() {
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		const searchParams = new URLSearchParams(location.search);
		const redirectedRoute = searchParams.get("route");

		if (!redirectedRoute || location.pathname !== "/") {
			return;
		}

		navigate(redirectedRoute, { replace: true });
	}, [location.pathname, location.search, navigate]);

	return null;
}

function App() {
	return (
		<BrowserRouter>
			<ScrollToTop />
			<StaticRouteBridge />
			<Suspense fallback={<ChunkFallback />}>
				<Routes>
					{/* Galleries and admin sit outside Layout on purpose: no site header,
					    no footer, nothing competing with the photographs. */}
					<Route path='/gallery/:slug' element={<GalleryPage />} />
					{/* Links to the old /g/:slug form are already in client inboxes. */}
					<Route path='/g/:slug' element={<LegacyGalleryRedirect />} />
					{/* The archive link mailed to a client. Carries its own credential, so
					    it sits outside the password gate as well as outside Layout. */}
					<Route path='/archive/:token' element={<ArchivePage />} />
					<Route path='/admin/*' element={<AdminApp />} />

					<Route element={<Layout />}>
						<Route path='/' element={<HomePage />} />
						<Route path='/portfolio' element={<PortfolioPage />} />
						<Route path='/tarifs' element={<PricingPage />} />
						<Route path='/contact' element={<ContactPage />} />
						<Route path='/a-propos' element={<AboutPage />} />
						<Route path='/conditions-generales-vente' element={<CgvPage />} />
						<Route path='/accueil' element={<Navigate to='/' replace />} />
						<Route path='*' element={<NotFoundPage />} />
					</Route>
				</Routes>
			</Suspense>
		</BrowserRouter>
	);
}

export default App;
