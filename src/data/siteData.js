export const siteConfig = {
	name: "Ankaa Studio",
	domain: "https://ankaastudio.fr",
	city: "Reims",
	region: "Marne",
	regionLabel: "Reims et dans la Marne",
	message: "Des images naturelles et sincères qui racontent votre histoire.",
	contactEmail: "sophie.marache@gmail.com",
	instagramUrl: "https://www.instagram.com/studio_ankaa",
	facebookUrl: "https://www.facebook.com/profile.php?id=61589453120077",
	calendlyUrl: "https://calendly.com/ankaa-studio"
};

export const navigation = [
	{ href: "/", label: "Accueil" },
	{ href: "/portfolio", label: "Portfolio" },
	{ href: "/tarifs", label: "Tarifs" },
	{ href: "/contact", label: "Contact" }
	//{ href: '/a-propos', label: 'À propos' }
	//{ href: "/blog", label: "Blog" }
];

export const socialLinks = [
	{ label: "Instagram", href: siteConfig.instagramUrl },
	{ label: "Facebook", href: siteConfig.facebookUrl }
];

export const heroStats = [
	{ value: "100%", label: "Séances sur mesure" },
	{ value: "4", label: "Univers photo" },
	{ value: "1", label: "Expérience complice" }
];

export const valueCards = [
	{
		title: "Douceur",
		text: "Une approche rassurante pour révéler la personnalité du chien sans contrainte.",
		icon: "✦"
	},
	{
		title: "Émotion",
		text: "Des images vraies, sensibles et élégantes pour raconter des liens sincères.",
		icon: "◌"
	},
	{
		title: "Direction artistique",
		text: "Une esthétique minimaliste et raffinée pour valoriser les sujets et les gestes.",
		icon: "◇"
	},
	{
		title: "Accompagnement",
		text: "Du brief à la livraison, chaque séance est pensée comme une expérience fluide.",
		icon: "▣"
	}
];

export const servicesPreview = [
	{
		title: "Chiens",
		text: "Portraits artistiques, scènes de liberté et détails de caractère.",
		image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80",
		alt: "Portrait d’un chien dans une lumière douce"
	},
	{
		title: "Humains & chiens",
		text: "Des liens authentiques entre complicité, gestes tendres et regards partagés.",
		image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
		alt: "Personne avec son chien lors d’une séance en extérieur"
	},
	{
		title: "Chiots",
		text: "Des souvenirs frais, tendres et joyeux pour les premiers mois de vie.",
		image: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=900&q=80",
		alt: "Chiot observant l’objectif dans un décor lumineux"
	}
];

export const portfolioItems = [
	{
		id: "chiens-1",
		category: "Chiens",
		title: "Portrait en lumière naturelle",
		description: "Une image douce et enveloppante pour révéler la présence du chien.",
		image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
		alt: "Portrait d’un chien au pelage clair dans une lumière naturelle"
	},
	{
		id: "chiens-2",
		category: "Chiens",
		title: "Exploration et liberté",
		description: "Un rendu dynamique pour des chiens actifs et expressifs.",
		image: "https://images.unsplash.com/photo-1450778869180-41d0601e46b8?auto=format&fit=crop&w=1200&q=80",
		alt: "Chien en mouvement dans un environnement extérieur"
	},
	{
		id: "humains-1",
		category: "Humains & chiens",
		title: "Complicité en famille",
		description: "Une scène intime et chaleureuse autour de la relation au quotidien.",
		image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
		alt: "Famille accompagnée de son chien pendant une séance photo"
	},
	{
		id: "humains-2",
		category: "Humains & chiens",
		title: "Couple et chien",
		description: "Une direction artistique tendre pour les séances en duo.",
		image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
		alt: "Couple avec son chien dans un cadre naturel"
	},
	{
		id: "chiots-1",
		category: "Chiots",
		title: "Premiers mois",
		description: "Une galerie délicate pour raconter les débuts de vie.",
		image: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=1200&q=80",
		alt: "Chiot curieux dans un décor doux"
	},
	{
		id: "evenements-1",
		category: "Événements",
		title: "Reportage canin",
		description: "Instants sur le vif, organisation d’événements et ambiance conviviale.",
		image: "https://images.unsplash.com/photo-1450778869180-41d0601e46b8?auto=format&fit=crop&w=1200&q=80",
		alt: "Reportage photo lors d’un événement canin en extérieur"
	},
	{
		id: "evenements-2",
		category: "Événements",
		title: "Détails de rencontre",
		description: "Un rendu éditorial pour valoriser l’énergie de l’événement.",
		image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
		alt: "Scène d’événement avec chien au premier plan"
	}
];

export const portfolioCategories = ["Toutes", "Chiens", "Humains & chiens", "Chiots", "Événements"];

export const testimonials = [
	{
		quote: "La séance a été douce, simple et naturelle. Le résultat nous ressemble vraiment.",
		name: "Séance famille",
		detail: "Complicité et souvenirs authentiques"
	},
	{
		quote: "Notre chien s’est laissé guider sans stress, et les images sont superbes.",
		name: "Portrait canin",
		detail: "Approche rassurante et fluide"
	},
	{
		quote: "Le reportage a parfaitement capté l’ambiance de l’événement et les détails importants.",
		name: "Événement canin",
		detail: "Récit visuel et direction artistique"
	}
];

export const pricingPlans = [
	{
		slug: "seance-chien",
		label: "Séance signature",
		name: "Séance chien",
		description: "Portraits artistiques pour capturer le caractère, les gestes et les expressions du chien.",
		duration: "Durée moyenne : 1h",
		photos: "8 photos retouchées incluses",
		delivery: "Galerie privée en ligne",
		price: "à partir de 180 €",
		priceNote: "hors options",
		featured: true
	},
	{
		slug: "seance-humain-chien",
		label: "Complicité",
		name: "Séance humain + chien",
		description: "Une séance sensible pour raconter le lien entre vous et votre compagnon.",
		duration: "Durée moyenne : 1h15",
		photos: "10 photos retouchées incluses",
		delivery: "Conseils tenues et préparation",
		price: "à partir de 220 €",
		priceNote: "hors déplacement",
		featured: false
	},
	{
		slug: "seance-chiot",
		label: "Débuts de vie",
		name: "Séance chiot",
		description: "Des images tendres et dynamiques pour immortaliser les premiers mois.",
		duration: "Durée moyenne : 45 min",
		photos: "6 photos retouchées incluses",
		delivery: "Séance adaptée au rythme du chiot",
		price: "à partir de 150 €",
		priceNote: "hors options",
		featured: false
	},
	{
		slug: "anniversaire-canin",
		label: "Événement joyeux",
		name: "Anniversaire canin",
		description: "Un reportage élégant pour célébrer une date importante avec style.",
		duration: "Durée moyenne : 1h",
		photos: "12 photos retouchées incluses",
		delivery: "Prises de vue de l’ambiance et des détails",
		price: "à partir de 240 €",
		priceNote: "sur devis",
		featured: false
	},
	{
		slug: "reportage-evenementiel",
		label: "Professionnels",
		name: "Reportage événementiel",
		description: "Pour vos rencontres, ateliers, journées portes ouvertes ou concours.",
		duration: "Durée sur devis",
		photos: "Sélection selon la couverture",
		delivery: "Livraison rapide pour communication",
		price: "sur devis",
		priceNote: "",
		featured: false
	},
	{
		slug: "communication-visuelle",
		label: "Marque et visibilité",
		name: "Communication visuelle professionnelle",
		description: "Photos de marque pour sites, réseaux sociaux, fiches et supports commerciaux.",
		duration: "Durée sur devis",
		photos: "Pack personnalisé",
		delivery: "Direction artistique adaptée à votre image",
		price: "sur devis",
		priceNote: "",
		featured: false
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
