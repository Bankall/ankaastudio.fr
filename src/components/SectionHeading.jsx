export function SectionHeading({ eyebrow, title, description, className = "" }) {
	return (
		<header className={`section-heading ${className}`.trim()}>
			{eyebrow ? <span className='eyebrow'>{eyebrow}</span> : null}
			<h2 className='section-heading__title'>{title}</h2>
			{description ? <p className='section-heading__description'>{description}</p> : null}
		</header>
	);
}
