/** Accumulates Minecraft primitives into a Buffer. Mirrors {@link Reader}. */
export class Writer {
	private readonly chunks: Buffer[] = [];

	writeByte(value: number): this {
		this.chunks.push(Buffer.from([value & 0xff]));
		return this;
	}

	writeVarInt(value: number): this {
		const bytes: number[] = [];
		let v = value >>> 0; // treat as unsigned 32-bit for the shift loop
		do {
			let temp = v & 0x7f;
			v >>>= 7;
			if (v !== 0) temp |= 0x80;
			bytes.push(temp);
		} while (v !== 0);
		this.chunks.push(Buffer.from(bytes));
		return this;
	}

	writeUnsignedShort(value: number): this {
		const b = Buffer.allocUnsafe(2);
		b.writeUInt16BE(value & 0xffff, 0);
		this.chunks.push(b);
		return this;
	}

	writeLong(value: bigint): this {
		const b = Buffer.allocUnsafe(8);
		b.writeBigInt64BE(value, 0);
		this.chunks.push(b);
		return this;
	}

	writeBytes(buf: Buffer): this {
		this.chunks.push(buf);
		return this;
	}

	writeString(value: string): this {
		const encoded = Buffer.from(value, "utf8");
		this.writeVarInt(encoded.length);
		this.chunks.push(encoded);
		return this;
	}

	toBuffer(): Buffer {
		return Buffer.concat(this.chunks);
	}
}
