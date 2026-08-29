import { SectionHeading } from "../components/SectionHeading.jsx";
import { Seo } from "../components/Seo.jsx";
import { siteConfig } from "../data/siteData.js";

export function CgvPage() {
	return (
		<>
			<Seo
				title='Conditions générales de vente | Ankaa Studio'
				description='Conditions générales de vente d’Ankaa Studio, photographe canin à Reims : réservation, tarifs, paiement, annulation, livraison et droits d’auteur.'
				path='/conditions-generales-vente'
				noIndex
			/>

			<section className='page-hero'>
				<div className='container'>
					<div className='page-hero__panel'></div>
				</div>
			</section>

			<section className='section'>
				<div className='container'>
					<SectionHeading level={1} title='Conditions générales de vente' description='Applicables à toute prestation photographique réalisée par Ankaa Studio. Dernière mise à jour&nbsp;: 23 août 2026.' />

					<article className='legal'>
						<h2>Article 1 — Identification du prestataire</h2>
						<p>Les présentes conditions générales de vente (ci-après «&nbsp;CGV&nbsp;») sont conclues entre&nbsp;:</p>
						<p>
							<strong>Ankaa Studio</strong> — Sophie Marache, entrepreneur individuel (micro-entreprise)
							<br />
							Siège&nbsp;: 22 Allée Albert Préjean, 51430 Tinqueux (Marne),
							<br />
							SIRET&nbsp;: 80924295100022
							<br />
							Email&nbsp;: <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
							<br />
							Site&nbsp;: {siteConfig.domain}
						</p>
						<p>ci-après «&nbsp;le Photographe&nbsp;», et toute personne physique ou morale souhaitant bénéficier de ses prestations, ci-après «&nbsp;le Client&nbsp;».</p>

						<h2>Article 2 — Objet et champ d’application</h2>
						<p>
							Les présentes CGV s’appliquent, sans restriction ni réserve, à l’ensemble des prestations de services photographiques proposées par le Photographe&nbsp;: séances photo (chiens, chiots, humains
							et chiens), reportages événementiels et prestations de communication visuelle pour les professionnels, ainsi qu’aux produits qui y sont associés (fichiers numériques, galeries en ligne,
							tirages éventuels).
						</p>
						<p>
							Toute réservation d’une prestation implique l’acceptation pleine et entière des présentes CGV, dont le Client reconnaît avoir pris connaissance préalablement. Les CGV prévalent sur tout autre
							document, sauf conditions particulières convenues par écrit entre les parties (devis signé notamment).
						</p>

						<h2>Article 3 — Prestations et tarifs</h2>
						<p>
							Les prestations, leur contenu (durée indicative, nombre de photos retouchées incluses, mode de livraison) et leurs tarifs sont décrits sur la page «&nbsp;Tarifs&nbsp;» du site. Les prix sont
							exprimés en euros et s’entendent nets&nbsp;: <strong>TVA non applicable, article 293&nbsp;B du Code général des impôts</strong>.
						</p>
						<p>
							Les tarifs affichés «&nbsp;à partir de&nbsp;» constituent des prix de base&nbsp;; les options, frais de déplacement au-delà de la zone habituelle d’intervention et demandes particulières font
							l’objet d’un chiffrage communiqué avant la réservation. Les prestations professionnelles (reportages, communication visuelle) font l’objet d’un devis personnalisé, valable 30 jours à compter
							de son émission.
						</p>
						<p>Le Photographe se réserve le droit de modifier ses tarifs à tout moment&nbsp;; les prestations sont facturées sur la base du tarif en vigueur au jour de la réservation.</p>

						<h2>Article 4 — Réservation</h2>
						<p>
							La réservation s’effectue en ligne (module de prise de rendez-vous), par email ou via le formulaire de contact. La réservation est ferme et définitive lorsque le Photographe a confirmé par
							écrit (email) la date, le lieu et le contenu de la prestation et, pour les prestations sur devis, lorsque le devis a été retourné signé avec la mention «&nbsp;bon pour accord&nbsp;».
						</p>
						<p>Aucun acompte n’est demandé à la réservation.</p>

						<h2>Article 5 — Paiement</h2>
						<p>
							Le règlement intervient après la séance, au plus tard à la livraison de la galerie&nbsp;: la galerie définitive et les fichiers numériques ne sont remis au Client qu’après{" "}
							<strong>paiement intégral</strong> de la prestation. Le paiement s’effectue par virement bancaire, ou par tout autre moyen convenu entre les parties. Une facture est remise au Client.
						</p>
						<p>
							Pour les Clients professionnels&nbsp;: sauf mention contraire sur le devis, les factures sont payables à réception. Conformément à l’article L.&nbsp;441-10 du Code de commerce, tout retard de
							paiement entraîne de plein droit l’application de pénalités de retard calculées au taux d’intérêt appliqué par la Banque centrale européenne à son opération de refinancement la plus récente
							majoré de 10 points, ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40&nbsp;€.
						</p>

						<h2>Article 6 — Annulation et report</h2>
						<p>
							<strong>Par le Client.</strong> La séance peut être reportée sans frais jusqu’à 48&nbsp;heures avant la date prévue (notamment en cas de météo défavorable ou d’indisponibilité de l’animal),
							sur simple demande par email&nbsp;; une nouvelle date est alors fixée d’un commun accord. En cas d’annulation ou de report demandé moins de 48&nbsp;heures avant la séance, ou en cas d’absence
							du Client au rendez-vous, le Photographe pourra facturer une indemnité forfaitaire égale à 30&nbsp;% du prix de la prestation réservée, sauf cas de force majeure dûment justifié.
						</p>
						<p>
							<strong>Par le Photographe.</strong> En cas d’empêchement du Photographe (maladie, accident, force majeure) ou de conditions rendant la séance impossible ou dangereuse pour l’animal, la séance
							est reportée à une date convenue d’un commun accord, sans frais ni indemnité. Si aucun report n’est possible, les sommes éventuellement versées sont intégralement remboursées, à l’exclusion de
							tout autre dédommagement.
						</p>

						<h2>Article 7 — Droit de rétractation</h2>
						<p>
							Lorsque la prestation est réservée à distance (site, email, téléphone) par un Client consommateur, celui-ci dispose, conformément à l’article L.&nbsp;221-18 du Code de la consommation, d’un
							délai de rétractation de 14&nbsp;jours à compter de la conclusion du contrat, sans avoir à motiver sa décision. La rétractation s’exerce par déclaration dénuée d’ambiguïté adressée à{" "}
							<a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>, le cas échéant au moyen du formulaire type annexé au Code de la consommation.
						</p>
						<p>
							Si le Client souhaite que la séance ait lieu avant l’expiration de ce délai, il en fait la demande expresse lors de la réservation. Conformément à l’article L.&nbsp;221-28 du Code de la
							consommation, le droit de rétractation ne peut plus être exercé pour une prestation pleinement exécutée avant la fin du délai&nbsp;; en cas de rétractation après une exécution partielle, le
							Client est redevable du prix correspondant à la partie exécutée.
						</p>

						<h2>Article 8 — Déroulement de la séance</h2>
						<p>
							Le Client demeure seul responsable de son animal pendant toute la durée de la séance&nbsp;: il en assure la garde, la surveillance et la sécurité, et garantit que l’animal est à jour de ses
							obligations légales (identification, vaccinations, et le cas échéant règles applicables aux chiens catégorisés). Tout dommage causé par l’animal à des tiers, au matériel ou au Photographe
							relève de la responsabilité du Client, titulaire d’une assurance responsabilité civile.
						</p>
						<p>
							Le Photographe adapte le déroulement de la séance au comportement et au rythme de l’animal. Le nombre et la nature des images obtenues dépendent de la coopération de l’animal&nbsp;; le
							Photographe s’engage à une obligation de moyens et ne garantit pas de poses ou d’images spécifiques. En cas de retard du Client, la durée de la séance pourra être réduite d’autant.
						</p>

						<h2>Article 9 — Livraison des photographies</h2>
						<p>
							Les photographies sélectionnées et retouchées sont livrées via une galerie privée en ligne, dans un délai indicatif de 2 à 4&nbsp;semaines après la séance (délai précisé lors de la réservation
							pour les prestations professionnelles). Le choix des images livrées et leur traitement relèvent de la sensibilité artistique du Photographe&nbsp;; les fichiers bruts (RAW) ne sont ni livrés ni
							cédés.
						</p>
						<p>
							La galerie reste accessible pendant une durée minimale de 3&nbsp;mois à compter de sa mise à disposition. Il appartient au Client de télécharger et de sauvegarder ses fichiers pendant cette
							période&nbsp;; passé ce délai, le Photographe ne garantit plus la conservation des images.
						</p>

						<h2>Article 10 — Propriété intellectuelle</h2>
						<p>
							Conformément au Code de la propriété intellectuelle (articles L.&nbsp;111-1 et suivants), les photographies réalisées demeurent la propriété intellectuelle exclusive du Photographe, seul
							titulaire des droits d’auteur.
						</p>
						<p>
							La livraison des fichiers confère au Client particulier un droit d’usage <strong>privé et non commercial</strong>&nbsp;: impressions personnelles, partage sur ses réseaux sociaux personnels
							sans altération de l’image (recadrage excessif, filtres, retouches supplémentaires). Toute utilisation commerciale, publicitaire ou éditoriale, ainsi que toute revente ou cession à des tiers,
							nécessite une autorisation écrite préalable du Photographe et, le cas échéant, une cession de droits facturée séparément. Pour les Clients professionnels, l’étendue des droits cédés (supports,
							durée, territoire) est précisée au devis.
						</p>

						<h2>Article 11 — Droit à l’image et promotion</h2>
						<p>
							Le Client autorise le Photographe à utiliser les photographies issues de la séance à des fins de promotion de son activité&nbsp;: portfolio, site internet, réseaux sociaux, supports de
							communication et concours photographiques. Cette autorisation est consentie à titre gracieux, sans limitation de durée, et ne donne lieu à aucune rémunération.
						</p>
						<p>
							Le Client peut refuser cette utilisation, en tout ou partie, en le notifiant par écrit (email) au plus tard le jour de la séance, ou à tout moment pour l’avenir&nbsp;; le Photographe retirera
							alors les images concernées de ses publications dans un délai raisonnable.
						</p>

						<h2>Article 12 — Responsabilité</h2>
						<p>
							Le Photographe met en œuvre tous les moyens raisonnables pour assurer la bonne exécution de la prestation et la conservation des fichiers jusqu’à leur livraison. En cas de perte totale ou
							partielle des images avant livraison (défaillance technique, vol, accident), la responsabilité du Photographe est limitée, au choix du Client, à la réalisation d’une nouvelle séance sans frais
							ou au remboursement des sommes versées, à l’exclusion de tout autre dédommagement.
						</p>
						<p>
							La responsabilité du Photographe ne peut être engagée en cas d’inexécution ou de mauvaise exécution due au fait du Client, au fait imprévisible et insurmontable d’un tiers, ou à un cas de
							force majeure au sens de l’article 1218 du Code civil.
						</p>

						<h2>Article 13 — Données personnelles</h2>
						<p>
							Les données personnelles collectées (identité, coordonnées, informations relatives à la prestation) sont traitées par le Photographe aux seules fins de gestion des réservations, de l’exécution
							des prestations, de la facturation et de la relation client. Elles sont conservées pendant la durée nécessaire à ces finalités et aux obligations légales (notamment comptables) et ne sont pas
							cédées à des tiers.
						</p>
						<p>
							Conformément au Règlement (UE) 2016/679 (RGPD) et à la loi «&nbsp;Informatique et Libertés&nbsp;», le Client dispose d’un droit d’accès, de rectification, d’effacement, de limitation,
							d’opposition et de portabilité de ses données, qu’il peut exercer en écrivant à <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>. Il peut également introduire une
							réclamation auprès de la CNIL (www.cnil.fr).
						</p>

						<h2>Article 14 — Médiation et litiges</h2>
						<p>
							En cas de réclamation, le Client est invité à s’adresser en priorité au Photographe à l’adresse <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a> afin de rechercher
							une solution amiable.
						</p>
						<p>
							Conformément aux articles L.&nbsp;612-1 et suivants du Code de la consommation, le Client consommateur peut recourir gratuitement à un médiateur de la consommation&nbsp;: [nom et coordonnées
							du médiateur à compléter après adhésion].
						</p>

						<h2>Article 15 — Droit applicable</h2>
						<p>
							Les présentes CGV sont soumises au droit français. À défaut de résolution amiable, tout litige relève des juridictions françaises compétentes&nbsp;; pour les Clients professionnels, compétence
							exclusive est attribuée aux tribunaux du ressort du siège du Photographe.
						</p>
					</article>
				</div>
			</section>
		</>
	);
}
