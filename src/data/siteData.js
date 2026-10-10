export const siteConfig = {
	name: "Ankaa Studio",
	domain: "https://ankaastudio.fr",
	city: "Reims",
	region: "Marne",
	regionLabel: "Reims et dans la Marne",
	message: "Des photos de votre chien qui lui ressemblent vraiment.",
	contactEmail: "sophie.marache@gmail.com",
	heroImage: "https://ankaastudio.fr/hero-background.min.jpg",
	instagramUrl: "https://www.instagram.com/studio_ankaa",
	facebookUrl: "https://www.facebook.com/profile.php?id=61589453120077",
	calendlyUrl: "https://calendly.com/ankaa-studio"
};

export const navigation = [
	{ href: "/", label: "Accueil" },
	{ href: "/a-propos", label: "Qui suis-je ?" },
	{ href: "/portfolio", label: "Portfolio" },
	{ href: "/tarifs", label: "Tarifs" },
	{ href: "/contact", label: "Contact" },
	{ href: "/conditions-generales-vente", label: "CGV" }
];

export const socialLinks = [
	{ label: "Instagram", href: siteConfig.instagramUrl },
	{ label: "Facebook", href: siteConfig.facebookUrl }
];

export const photographyCards = [
	{
		url: "/home/Fichier 4.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	},
	{
		url: "/home/Fichier 3.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	},
	{
		url: "/home/Fichier 2.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	},
	{
		url: "/home/Fichier 1.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	}
];

// Served from the media bucket, not from public/: see infra/upload-video.sh for
// how a new montage gets there.
export const videoCard = {
	url: "/video/showreel.mp4",
	text: "Vidéo d’un chien et maitresse en concours d'agility"
};

export const designCards = [
	{
		url: "/home/Fichier 6.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	},
	{
		url: "/home/Fichier 5.jpg",
		text: "Portrait d’un chien dans une lumière douce"
	},
	{
		url: "/home/Fichier 7.png",
		text: "Portrait d’un chien dans une lumière douce"
	}
];

export const testimonials = [
	{
		quote: `J’ai rencontré Sophie par hasard lors d’un événement. J’ai adoré les photos qu’elle a prises à cette occasion et ai alors suivi sa page. Et j’ai tout de suite accroché aux photos partagées : j’avais l’impression d’y être. J’ai donc choisi de lui confier le shooting d’Alaska ainsi que pour nos 10 ans avec mon conjoint. Et le rendu est exceptionnel : je n’ai pas su choisir tellement elles sont magnifiques. Elle ne partage pas seulement une image : une réelle émotion se dégage de ses photos.
		Encore merci Sophie, et à très vite pour un nouveau shooting ! 📸`,
		name: "Mélody Hunter",
		avatar: "/testimonials/melody-hunter.jpg"
	},
	{
		quote: "Tellement heureuse d’avoir fait confiance à Sophie pour immortaliser de précieux instants avec ma Naïa. Beaucoup d’amour, de douceur, de bienveillance et de professionnalisme pendant le shooting. Résultat : de magnifiques photos qui reflètent la douceur et le brin de folie de ma compagne à 4 pattes !",
		name: "Anne Claire Dvl",
		avatar: "/testimonials/anne-claire-dvl.jpg"
	},
	{
		quote: "Il ne faut pas hésiter à faire un shooting photo avec elle, les photos sont sublimes. Elle est douce donc met à l’aise les chiens sensibles. Une très bonne expérience pour mes chiens et moi.",
		name: "Elodie Elo",
		avatar: "/testimonials/elodie-elo.jpg"
	},
	{
		quote: "Sophie avec son joli coup d’œil a régulièrement shooté mon Saïan. Amoureuse des animaux, elle sait faire ressortir le meilleur d’eux avec beaucoup de douceur et de respect de leurs besoins. On adore !",
		name: "Stephanie Sauvage Goncalves Hubas",
		avatar: "/testimonials/stephanie-sauvage.jpg"
	},
	{
		quote: "Super expérience avec Ankaa Studio. Elle met vite à l’aise et s’adapte vraiment bien au chien, ce qui rend la séance fluide et agréable. Les photos sont très réussies, avec une belle lumière et un vrai sens du détail. On sent qu’il y a du travail derrière ! Très contente du rendu, je recommande sans hésiter.",
		name: "Marie Mylinh Lavolé",
		avatar: "/testimonials/marie-mylinh-lavole.jpg"
	}
];

export const pricingPlans = [
	{
		slug: "seance-photo",
		name: "Séance photo",
		featured: true
	},
	{
		slug: "reportage-video",
		name: "Reportage vidéo",
		featured: true
	},
	{
		slug: "creation-graphique",
		name: "Création graphique",
		featured: true
	},
	{
		slug: "other-services",
		label: "Autres services",
		name: "Autres services"
	}
];

export const aboutHighlights = [
	"Un regard sensible pour des images sincères et intemporelles.",
	"Une expérience pensée pour le confort du chien et la simplicité du geste.",
	"Une direction artistique épurée, élégante et cohérente avec votre univers."
];

export const blogDrafts = [
	{
		title: "Préparer son chien à une séance photo",
		text: "Un futur article pour guider les clients avant la séance."
	},
	{
		title: "Pourquoi photographier les chiots tôt ?",
		text: "Un sujet à enrichir pour le blog de marque et le SEO local."
	},
	{
		title: "Réussir un reportage événementiel canin",
		text: "Un angle utile pour les professionnels du monde canin."
	}
];
