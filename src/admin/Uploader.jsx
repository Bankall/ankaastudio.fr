import { useCallback, useRef, useState } from "react";
import { adminApi, uploadToS3 } from "../utils/galleryApi.js";
import { DEFAULT_SET_TITLE } from "../utils/gallerySets.js";

// Four at a time: enough to saturate a domestic upstream, few enough that each
// file's progress bar still moves visibly.
const CONCURRENCY = 4;
const RETRIES = 3;
// Presigned POSTs live 15 minutes, so retries are cheap and safe inside a batch.
const BATCH_SIZE = 50;

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,.avif";

async function withRetries(task, attempts) {
	let lastError;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await task();
		} catch (error) {
			lastError = error;

			if (attempt < attempts) {
				await new Promise(resolve => setTimeout(resolve, 500 * attempt));
			}
		}
	}

	throw lastError;
}

/** Runs tasks with a fixed number of workers, preserving result order. */
async function mapWithLimit(items, limit, task) {
	const results = new Array(items.length);
	let cursor = 0;

	const worker = async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await task(items[index], index);
		}
	};

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

	return results;
}

export function Uploader({ gid, sets = [], archived = false, onUploaded }) {
	const [items, setItems] = useState([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [dragging, setDragging] = useState(false);
	// Which set the next drop lands in. Chosen before the drop rather than fixed up
	// afterwards, because a 200-photo batch is painful to re-file one tile at a time.
	const [target, setTarget] = useState("");
	const inputRef = useRef(null);
	const abortRef = useRef(null);

	const patchItem = useCallback((key, patch) => {
		setItems(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));
	}, []);

	const run = useCallback(
		async files => {
			setBusy(true);
			setError("");
			abortRef.current = new AbortController();

			const queued = files.map((file, index) => ({
				key: `${file.name}-${file.size}-${index}-${file.lastModified}`,
				name: file.name,
				file,
				status: "queued",
				progress: 0
			}));

			setItems(queued);

			// The set may have been deleted between choosing it and dropping the files,
			// and the API rejects an id it does not know; the gallery itself always exists.
			const destination = sets.some(set => set.id === target) ? target : null;
			const uploaded = [];

			try {
				// Batched so a 400-photo drop does not ask for 400 signatures at once.
				for (let offset = 0; offset < queued.length; offset += BATCH_SIZE) {
					const batch = queued.slice(offset, offset + BATCH_SIZE);
					const { uploads } = await adminApi.requestUploads(
						gid,
						batch.map(item => ({ name: item.name, size: item.file.size, type: item.file.type }))
					);

					await mapWithLimit(batch, CONCURRENCY, async (item, index) => {
						const target = uploads[index];
						patchItem(item.key, { status: "uploading" });

						try {
							await withRetries(
								() =>
									uploadToS3({
										url: target.url,
										fields: target.fields,
										file: item.file,
										signal: abortRef.current.signal,
										onProgress: ratio => patchItem(item.key, { progress: ratio })
									}),
								RETRIES
							);

							patchItem(item.key, { status: "processing", progress: 1 });
							uploaded.push({ pid: target.pid, extension: target.extension, originalName: target.originalName });
						} catch (failure) {
							patchItem(item.key, { status: "error", error: failure.message });
						}
					});

					// Queue derivatives per batch rather than at the very end, so the first
					// photos are already visible while the last ones are still uploading.
					const fresh = uploaded.splice(0, uploaded.length);

					if (fresh.length > 0) {
						await adminApi.processPhotos(gid, fresh, destination);
						setItems(current => current.map(item => (item.status === "processing" ? { ...item, status: "done" } : item)));
					}
				}

				await onUploaded();
			} catch (failure) {
				setError(failure.message ?? "L’envoi a échoué.");
			} finally {
				setBusy(false);
				abortRef.current = null;
			}
		},
		[gid, sets, target, onUploaded, patchItem]
	);

	const handleFiles = fileList => {
		const files = Array.from(fileList).filter(file => file.type.startsWith("image/") || /\.(tiff?|heic|heif)$/i.test(file.name));

		if (files.length > 0) {
			run(files);
		}
	};

	const done = items.filter(item => item.status === "done").length;
	const failed = items.filter(item => item.status === "error");

	return (
		<div className='admin-uploader'>
			{sets.length > 0 ?
				<div className='admin-uploader__target'>
					<label htmlFor='upload-target'>Envoyer dans</label>
					<select id='upload-target' value={target} disabled={busy} onChange={event => setTarget(event.target.value)}>
						<option value=''>{DEFAULT_SET_TITLE} (hors ensemble)</option>
						{sets.map(set => (
							<option key={set.id} value={set.id}>
								{set.title}
							</option>
						))}
					</select>
				</div>
			:	null}

			{/* A label wrapping the input keeps the whole zone clickable without a
			    click handler faking it. */}
			<label
				className={`admin-dropzone${dragging ? " is-dragging" : ""}`}
				onDragOver={event => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={event => {
					event.preventDefault();
					setDragging(false);
					handleFiles(event.dataTransfer.files);
				}}
			>
				<input ref={inputRef} type='file' multiple accept={ACCEPTED} hidden disabled={busy} onChange={event => handleFiles(event.target.files)} />
				<strong>Glissez vos photos ici</strong>
				<span>ou cliquez pour choisir des fichiers — JPEG, PNG, WebP, TIFF, HEIC. 120 Mo par fichier.</span>
			</label>

			{/* Said before the drop, not after: the tiles will come back "archivée" with
			    no image, which reads as a failed upload unless you knew that going in. */}
			{archived ?
				<p className='admin-hint'>Galerie archivée : les fichiers envoyés partent directement en archive froide, sans aperçu ni fichier HD. Ils seront traités avec les autres à la sortie d’archive.</p>
			:	null}

			{items.length > 0 ?
				<div className='admin-uploader__status'>
					<p className='admin-uploader__summary'>
						{done} / {items.length} envoyée{items.length > 1 ? "s" : ""}
						{busy ? " — envoi en cours…" : " — terminé."}
					</p>

					<ul className='admin-uploader__list'>
						{items.map(item => (
							<li key={item.key} className={`admin-uploader__item is-${item.status}`}>
								<span className='admin-uploader__name'>{item.name}</span>
								<span className='admin-uploader__bar'>
									<span style={{ width: `${Math.round(item.progress * 100)}%` }} />
								</span>
								<span className='admin-uploader__state'>
									{item.status === "error" ? "échec"
									: item.status === "done" ? "ok"
									: item.status === "processing" ? "traitement"
									: `${Math.round(item.progress * 100)}%`}
								</span>
							</li>
						))}
					</ul>

					{failed.length > 0 ?
						<p className='admin-error'>
							{failed.length} fichier{failed.length > 1 ? "s" : ""} n’a pas pu être envoyé. Réessayez en le sélectionnant à nouveau.
						</p>
					:	null}
				</div>
			:	null}

			{error ?
				<p className='admin-error' role='alert'>
					{error}
				</p>
			:	null}
		</div>
	);
}
