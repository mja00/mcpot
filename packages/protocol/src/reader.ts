import { IncompleteError, ProtocolError } from "./errors.js";

/** Default hard cap on a length-prefixed string's byte length. Vanilla fields are far smaller. */
export const DEFAULT_MAX_STRING_BYTES = 32767;

/**
 * Cursor over a Buffer that reads Minecraft primitives. Throws IncompleteError when more bytes are
 * needed (retryable) and ProtocolError on malformed input (fatal) — the split lets the frame reader
 * distinguish "wait for TCP" from "hostile client, drop it".
 */
export class Reader {
	private offset = 0;

	constructor(private readonly buf: Buffer) {}

	get position(): number {
		return this.offset;
	}

	get remaining(): number {
		return this.buf.length - this.offset;
	}

	readByte(): number {
		if (this.remaining < 1) throw new IncompleteError();
		return this.buf[this.offset++]!;
	}

	// VarInt is a signed 32-bit int in at most 5 bytes; reject overlong encodings to stop parser abuse.
	readVarInt(): number {
		let value = 0;
		let position = 0;
		let byte: number;
		do {
			if (this.remaining < 1) throw new IncompleteError();
			byte = this.buf[this.offset++]!;
			value |= (byte & 0x7f) << position;
			position += 7;
			if (position > 35) throw new ProtocolError("VarInt too long");
		} while ((byte & 0x80) !== 0);
		return value | 0;
	}

	// VarLong is a signed 64-bit int in at most 10 bytes; returned as bigint.
	readVarLong(): bigint {
		let value = 0n;
		let position = 0n;
		let byte: number;
		do {
			if (this.remaining < 1) throw new IncompleteError();
			byte = this.buf[this.offset++]!;
			value |= BigInt(byte & 0x7f) << position;
			position += 7n;
			if (position > 70n) throw new ProtocolError("VarLong too long");
		} while ((byte & 0x80) !== 0);
		return BigInt.asIntN(64, value);
	}

	readUnsignedShort(): number {
		if (this.remaining < 2) throw new IncompleteError();
		const value = this.buf.readUInt16BE(this.offset);
		this.offset += 2;
		return value;
	}

	readLong(): bigint {
		if (this.remaining < 8) throw new IncompleteError();
		const value = this.buf.readBigInt64BE(this.offset);
		this.offset += 8;
		return value;
	}

	readBytes(length: number): Buffer {
		if (length < 0) throw new ProtocolError("negative length");
		if (this.remaining < length) throw new IncompleteError();
		const out = this.buf.subarray(this.offset, this.offset + length);
		this.offset += length;
		return out;
	}

	// A UUID is 16 raw bytes; format as canonical 8-4-4-4-12 hex.
	readUuid(): string {
		const bytes = this.readBytes(16);
		const hex = bytes.toString("hex");
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}

	// Length-prefixed UTF-8 string; cap the length before allocating to block multi-MB payloads.
	readString(maxBytes: number = DEFAULT_MAX_STRING_BYTES): string {
		const length = this.readVarInt();
		if (length < 0) throw new ProtocolError("negative string length");
		if (length > maxBytes) throw new ProtocolError(`string exceeds ${maxBytes} bytes`);
		return this.readBytes(length).toString("utf8");
	}
}
