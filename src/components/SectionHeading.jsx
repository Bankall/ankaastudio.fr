export function SectionHeading({ eyebrow, title, description, className = "" }) {
	// A string description may contain markup (<br/>, <strong>, links…). The copy is authored
	// in the repo, never user input, so injecting it as HTML is safe here. A description passed
	// as a React node is rendered as-is.
	const descriptionNode =
		typeof description === "string" ? <p className='section-heading__description' dangerouslySetInnerHTML={{ __html: description }} /> : <p className='section-heading__description'>{description}</p>;

	return (
		<header className={["section-heading", className, description ? "" : "no-description"].filter(Boolean).join(" ")}>
			{eyebrow ?
				<span className='eyebrow'>{eyebrow}</span>
			:	null}
			<h2 className='section-heading__title'>{title}</h2>
			{description ? descriptionNode : null}
		</header>
	);
}
