import { badRequest } from "./http.mjs";

export function str(value, field, { max = 200, required = false, allowEmpty = true } = {}) {
	if (value === undefined || value === null) {
		if (required) {
			throw badRequest(`Le champ « ${field} » est obligatoire.`);
		}

		return null;
	}

	if (typeof value !== "string") {
		throw badRequest(`Le champ « ${field} » doit être du texte.`);
	}

	const trimmed = value.trim();

	if (!allowEmpty && !trimmed) {
		throw badRequest(`Le champ « ${field} » ne peut pas être vide.`);
	}

	if (trimmed.length > max) {
		throw badRequest(`Le champ « ${field} » dépasse ${max} caractères.`);
	}

	return trimmed;
}

export function bool(value, field) {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== "boolean") {
		throw badRequest(`Le champ « ${field} » doit être vrai ou faux.`);
	}

	return value;
}

export function oneOf(value, field, allowed) {
	if (value === undefined || value === null) {
		return null;
	}

	if (!allowed.includes(value)) {
		throw badRequest(`Le champ « ${field} » doit valoir : ${allowed.join(", ")}.`);
	}

	return value;
}

/** ISO date or date-time; empty string means "clear it". */
export function isoDate(value, field) {
	if (value === undefined) {
		return undefined;
	}

	if (value === null || value === "") {
		return null;
	}

	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		throw badRequest(`Le champ « ${field} » n'est pas une date valide.`);
	}

	return new Date(parsed).toISOString();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value, field, { required = false } = {}) {
	const text = str(value, field, { max: 254, required });

	if (!text) {
		return null;
	}

	if (!EMAIL_PATTERN.test(text)) {
		throw badRequest(`Le champ « ${field} » n'est pas une adresse email valide.`);
	}

	return text;
}

export function stringArray(value, field, { max = 5000, itemMax = 40 } = {}) {
	if (value === undefined || value === null) {
		return null;
	}

	if (!Array.isArray(value)) {
		throw badRequest(`Le champ « ${field} » doit être une liste.`);
	}

	if (value.length > max) {
		throw badRequest(`Le champ « ${field} » dépasse ${max} éléments.`);
	}

	return value.map(item => {
		if (typeof item !== "string" || !item || item.length > itemMax) {
			throw badRequest(`Le champ « ${field} » contient une valeur invalide.`);
		}

		return item;
	});
}
