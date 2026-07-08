/**
 * Small deterministic PRNG toolkit. The server generates a daemon's persona from a seed, and the
 * daemon reproduces the same variation (favicon, curve phase) from that seed — so both agree without
 * shipping large blobs around. Not cryptographic; only used for cosmetic realism.
 */

/** FNV-1a hash of a string → uint32, used to seed the PRNG. */
export function hashString(str: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32: fast, decent-quality seeded generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Seed a PRNG directly from a string. */
export function rngFromString(seed: string): () => number {
	return mulberry32(hashString(seed));
}

export function randInt(rng: () => number, min: number, max: number): number {
	return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element uniformly. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length)]!;
}

/** Pick one element by integer weights (same length as items). */
export function pickWeighted<T>(rng: () => number, items: readonly T[], weights: readonly number[]): T {
	const total = weights.reduce((a, b) => a + b, 0);
	let r = rng() * total;
	for (let i = 0; i < items.length; i++) {
		r -= weights[i]!;
		if (r < 0) return items[i]!;
	}
	return items[items.length - 1]!;
}

/** Sample `count` distinct elements (Fisher-Yates on a copy, truncated). */
export function sample<T>(rng: () => number, items: readonly T[], count: number): T[] {
	const arr = [...items];
	const n = Math.min(count, arr.length);
	for (let i = 0; i < n; i++) {
		const j = i + Math.floor(rng() * (arr.length - i));
		[arr[i], arr[j]] = [arr[j]!, arr[i]!];
	}
	return arr.slice(0, n);
}
