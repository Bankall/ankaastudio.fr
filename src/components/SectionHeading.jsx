// Pass level={1} on the heading that acts as the page title, so a page whose hero carries no
// text still has an h1. Defaults to h2, the right level for a section inside a page.
export function SectionHeading({ eyebrow, title, description, className = "", level = 2 }) {
	const Title = `h${level}`;

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
			<Title className='section-heading__title'>{title}</Title>
			{description ? descriptionNode : null}
		</header>
	);
}
