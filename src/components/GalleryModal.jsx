export function GalleryModal({ item, onClose }) {
	if (!item) {
		return null;
	}

	return (
		<div className='modal' role='presentation' onClick={onClose}>
			<div className='modal__panel' role='dialog' aria-modal='true' aria-labelledby='gallery-modal-title' onClick={event => event.stopPropagation()}>
				<div className='modal__media'>
					<img className='modal__image' src={item.image} alt={item.alt} />
				</div>
				<div className='modal__content'>
					<button type='button' className='modal__close' aria-label='Fermer la galerie' onClick={onClose}>
						×
					</button>
					<span className='gallery-card__category'>{item.category}</span>
					<h3 className='modal__title' id='gallery-modal-title'>
						{item.title}
					</h3>
					<p className='modal__text'>{item.description}</p>
				</div>
			</div>
		</div>
	);
}
