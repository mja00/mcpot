import { IncompleteError, ProtocolError } from "./errors.js";
import { Reader } from "./reader.js";

/** Hard cap on a single uncompressed packet. Vanilla handshake/status/login packets are tiny. */
export const DEFAULT_MAX_PACKET_BYTES = 2 * 1024 * 1024;

/** First byte of the pre-1.7 legacy Server List Ping, which is NOT VarInt-framed. */
export const LEGACY_PING_BYTE = 0xfe;

export interface Frame {
	readonly id: number;
	readonly body: Reader;
}

/**
 * Accumulates raw TCP chunks and yields complete, uncompressed Minecraft frames. TCP gives no message
 * boundaries, so a frame may span several chunks or several frames may arrive in one — this buffers
 * until a full frame is present. We never negotiate compression on a honeypot, so framing stays plain.
 */
export class FrameReader {
	private buffered: Buffer = Buffer.alloc(0);

	constructor(private readonly maxPacketBytes: number = DEFAULT_MAX_PACKET_BYTES) {}

	push(chunk: Buffer): void {
		this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk]);
	}

	get bufferedBytes(): number {
		return this.buffered.length;
	}

	/** First buffered byte without consuming it, for legacy-ping detection before framing. */
	peekByte(): number | undefined {
		return this.buffered.length > 0 ? this.buffered[0] : undefined;
	}

	/** Consume and return all buffered bytes (used to hand raw legacy-ping bytes to a dedicated parser). */
	drain(): Buffer {
		const out = this.buffered;
		this.buffered = Buffer.alloc(0);
		return out;
	}

	/** Returns the next complete frame, or null if more bytes are needed. Throws ProtocolError on abuse. */
	next(): Frame | null {
		const reader = new Reader(this.buffered);
		let length: number;
		try {
			length = reader.readVarInt();
		} catch (err) {
			if (err instanceof IncompleteError) return null;
			throw err;
		}
		if (length < 1) throw new ProtocolError("non-positive packet length");
		if (length > this.maxPacketBytes) throw new ProtocolError(`packet length ${length} exceeds cap`);

		const headerLen = reader.position;
		if (this.buffered.length - headerLen < length) return null; // body not fully arrived yet

		const body = this.buffered.subarray(headerLen, headerLen + length);
		this.buffered = this.buffered.subarray(headerLen + length);

		const bodyReader = new Reader(body);
		const id = bodyReader.readVarInt();
		return { id, body: bodyReader };
	}
}
