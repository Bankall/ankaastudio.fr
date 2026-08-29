import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Seo } from "../components/Seo.jsx";
import { SectionHeading } from "../components/SectionHeading.jsx";
import { pricingPlans, socialLinks, siteConfig } from "../data/siteData.js";
import { getRecaptchaToken, preloadRecaptcha } from "../utils/recaptcha.js";

const contactStructuredData = {
	"@context": "https://schema.org",
	"@type": "PhotographicStudio",
	name: siteConfig.name,
	url: `${siteConfig.domain}/contact`,
	areaServed: ["Reims", "Marne"],
	sameAs: [siteConfig.instagramUrl, siteConfig.facebookUrl]
};

const defaultFormState = {
	name: "",
	email: "",
	service: pricingPlans[0].slug,
	message: "",
	// Honeypot: real users never fill this (it's hidden); bots often do.
	website: ""
};

export function ContactPage() {
	const [searchParams] = useSearchParams();
	const preselectedService = searchParams.get("prestation");
	const [formState, setFormState] = useState(() => ({
		...defaultFormState,
		service: preselectedService || defaultFormState.service
	}));
	const [sentMessage, setSentMessage] = useState("");
	const [status, setStatus] = useState("idle");

	const contactEndpoint = import.meta.env.VITE_CONTACT_ENDPOINT;

	// Warm up the reCAPTCHA script so a token is ready by submit time.
	useEffect(() => {
		preloadRecaptcha();
	}, []);

	const selectedPlan = useMemo(() => pricingPlans.find(plan => plan.slug === formState.service) || pricingPlans[0], [formState.service]);

	const handleChange = event => {
		const { name, value } = event.target;

		setFormState(currentValue => ({
			...currentValue,
			[name]: value
		}));
	};

	const sendViaMailto = () => {
		const subject = encodeURIComponent(`Demande de réservation - ${selectedPlan.name}`);
		const body = encodeURIComponent([`Nom: ${formState.name}`, `Email: ${formState.email}`, `Prestation: ${selectedPlan.name}`, "", formState.message].join("\n"));

		setSentMessage("Votre messagerie s’ouvre : il ne reste plus qu’à envoyer.");
		window.location.href = `mailto:${siteConfig.contactEmail}?subject=${subject}&body=${body}`;
	};

	const handleSubmit = async event => {
		event.preventDefault();

		// No API configured: keep the mailto fallback.
		if (!contactEndpoint) {
			sendViaMailto();
			return;
		}

		setStatus("sending");
		setSentMessage("Envoi en cours…");

		try {
			const recaptchaToken = await getRecaptchaToken("contact");

			const res = await fetch(contactEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: formState.name,
					email: formState.email,
					service: selectedPlan.name,
					message: formState.message,
					website: formState.website,
					recaptchaToken
				})
			});

			if (!res.ok) {
				throw new Error(`Request failed with status ${res.status}`);
			}

			setStatus("sent");
			setSentMessage("Merci ! J’ai bien reçu votre message, je vous réponds très vite.");
			setFormState(defaultFormState);
		} catch {
			setStatus("error");
			setSentMessage("L’envoi n’a pas fonctionné. J’ouvre votre messagerie pour que rien ne soit perdu…");
			sendViaMailto();
		}
	};

	return (
		<>
			<Seo
				title='Contact et réservation | Ankaa Studio'
				description='Contactez Ankaa Studio pour réserver une séance photo chien à Reims et dans la Marne, ou pour demander un reportage professionnel.'
				path='/contact'
				structuredData={contactStructuredData}
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section'>
				<div className='container contact-section'>
					<SectionHeading
						level={1}
						eyebrow='Contact et réservation'
						title='Dites-moi tout sur votre projet'
						description='Une envie de séance, une question, une idée encore un peu floue ? Écrivez-moi quelques mots et construisons ensemble la séance qui vous ressemble, à vous et à votre animal.'
					/>

					<div className='contact-layout'>
						<div>
							<form className='contact-form card' onSubmit={handleSubmit}>
								{/* Honeypot field — hidden from users, ignored by real submissions. */}
								<div aria-hidden='true' style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}>
									<label htmlFor='website'>Ne pas remplir</label>
									<input id='website' name='website' type='text' tabIndex={-1} autoComplete='off' value={formState.website} onChange={handleChange} />
								</div>
								<div className='form-grid'>
									<div className='field'>
										<label htmlFor='name'>Prénom et nom</label>
										<input id='name' name='name' type='text' required value={formState.name} onChange={handleChange} placeholder='Votre prénom et nom' />
									</div>

									<div className='field'>
										<label htmlFor='email'>Email</label>
										<input id='email' name='email' type='email' required value={formState.email} onChange={handleChange} placeholder='vous@exemple.fr' />
									</div>

									<div className='field field--full'>
										<label htmlFor='service'>Type de prestation</label>
										<select id='service' name='service' value={formState.service} onChange={handleChange}>
											{pricingPlans.map(plan => (
												<option key={plan.slug} value={plan.slug}>
													{plan.name}
												</option>
											))}
										</select>
									</div>

									<div className='field field--full'>
										<label htmlFor='message'>Message</label>
										<textarea
											id='message'
											name='message'
											required
											value={formState.message}
											onChange={handleChange}
											placeholder='Parlez-moi de votre animal, de ce que vous imaginez et de la période qui vous conviendrait.'
										/>
									</div>
								</div>

								<div className='form-actions'>
									<button className='button' type='submit' disabled={status === "sending"}>
										{status === "sending" ? "Envoi en cours…" : "Envoyer mon message"}
									</button>
								</div>

								{sentMessage ?
									<div className='form-feedback'>{sentMessage}</div>
								:	null}
							</form>
						</div>

						<div className='page-stack'>
							<article className='contact-card'>
								<span className='contact-card__eyebrow'>Informations</span>
								<p className='contact-card__text'>
									Basée dans la Marne, je me déplace à Reims et aux alentours, pour des séances en extérieur, dans vos lieux de vie ou de balade, au rythme de votre animal.
								</p>
								<ul className='contact-card__list'>
									<li>
										<a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
									</li>
									<li>{siteConfig.regionLabel}</li>
									<li>{siteConfig.message}</li>
								</ul>
							</article>

							<article className='contact-card'>
								<span className='contact-card__eyebrow'>Réseaux sociaux</span>
								<p className='contact-card__text'>Sur Instagram et Facebook, je partage les coulisses des séances et mes disponibilités du moment. Un message y est tout aussi bienvenu.</p>
								<ul className='contact-card__list'>
									{socialLinks.map(social => (
										<li key={social.label}>
											<a href={social.href} target='_blank' rel='noreferrer'>
												{social.label}
											</a>
										</li>
									))}
								</ul>
							</article>

							<article className='embed-card card'>
								<div className='contact-card' style={{ boxShadow: "none", border: "0", background: "transparent", padding: "1.2rem 1.2rem 0" }}>
									<span className='contact-card__eyebrow'>Calendly</span>
									<h2 className='contact-card__title'>Trouvons un créneau ensemble</h2>
									{/* 
									<div className='form-actions'>
										<a className='button-secondary' href={siteConfig.calendlyUrl} target='_blank' rel='noreferrer'>
											Réserver via Calendly
										</a>
									</div> */}
								</div>
								<iframe className='embed-card__frame' title='Calendly Ankaa Studio' src={siteConfig.calendlyUrl} loading='lazy' />
							</article>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
