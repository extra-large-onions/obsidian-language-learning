import { ROLES } from './types';

/** Roles that take a colour. Punctuation stays faint, whatever the theme. */
export const COLOURABLE_ROLES = ROLES.filter((role) => role !== 'punct');

/**
 * The built-in palette, as the light theme draws it. The stylesheet holds a
 * lighter set for dark mode. A colour set by the user replaces both, because
 * a deliberate choice should not be second-guessed by the theme.
 */
export const DEFAULT_ROLE_COLOURS: Record<string, string> = {
	subject: '#4462a7',
	verb: '#ae5742',
	object: '#36786a',
	complement: '#935ea1',
	modifier: '#947342',
	connector: '#517b90',
	marker: '#6c7c46',
	negation: '#a6546f',
};

/** Anything else never reaches the document. */
const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * The custom property that carries a role's colour. The stylesheet sets a
 * default on the body element; the plugin writes an override onto that same
 * element, where an inline value outranks every selector.
 */
export function roleVar(role: string): string {
	return `--ll-${role}`;
}

/** A colour the user set, if it is one worth writing into the document. */
export function validColour(value: string | undefined): string | null {
	if (!value || !HEX.test(value)) return null;
	return value;
}

/** True when this role is one the user is allowed to recolour. */
export function isColourable(role: string): boolean {
	return (COLOURABLE_ROLES as readonly string[]).includes(role);
}

/** `subject` reads as `Subject` in the settings list. */
export function roleLabel(role: string): string {
	return role.charAt(0).toUpperCase() + role.slice(1);
}
