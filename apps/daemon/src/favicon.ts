import { deflateSync } from "node:zlib";
import { hashString, mulberry32 } from "@mcpot/shared";

// Deterministic per-seed favicon: a symmetric "identicon" 64x64 PNG, hand-encoded (no image deps).
// Gives each fake server a distinct custom icon like a real one, reproducible from the persona seed.

const SIZE = 64;
const CELL = 8;
const GRID = SIZE / CELL;

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

function renderPng(seed: string): Buffer {
	const rng = mulberry32(hashString(`${seed}:favicon`));
	// Foreground: a saturated color; background: near-white, as most real favicons read.
	const fg = [randByte(rng, 40, 200), randByte(rng, 40, 200), randByte(rng, 40, 200)];
	const bg = [randByte(rng, 235, 250), randByte(rng, 235, 250), randByte(rng, 235, 250)];

	// Only the left half of the grid is random; mirror it for a face-like symmetric icon.
	const cells: boolean[][] = [];
	for (let gy = 0; gy < GRID; gy++) {
		cells[gy] = [];
		for (let gx = 0; gx < Math.ceil(GRID / 2); gx++) cells[gy]![gx] = rng() < 0.5;
	}

	const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
	let p = 0;
	for (let y = 0; y < SIZE; y++) {
		raw[p++] = 0; // no per-row filter
		for (let x = 0; x < SIZE; x++) {
			const gy = Math.floor(y / CELL);
			let gx = Math.floor(x / CELL);
			if (gx >= GRID / 2) gx = GRID - 1 - gx; // mirror right half
			const [r, g, b] = cells[gy]![gx] ? fg : bg;
			raw[p++] = r!;
			raw[p++] = g!;
			raw[p++] = b!;
		}
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(SIZE, 0);
	ihdr.writeUInt32BE(SIZE, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: RGB
	// bytes 10-12 (compression/filter/interlace) stay 0

	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return Buffer.concat([
		signature,
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function randByte(rng: () => number, min: number, max: number): number {
	return min + Math.floor(rng() * (max - min + 1));
}

const cache = new Map<string, string>();

/** `data:image/png;base64,...` for a seed, cached so we don't re-encode on every ping. */
export function getFavicon(seed: string): string {
	let uri = cache.get(seed);
	if (!uri) {
		uri = `data:image/png;base64,${renderPng(seed).toString("base64")}`;
		cache.set(seed, uri);
	}
	return uri;
}
