import { describe, expect, it } from "vitest";
import { IncompleteError, ProtocolError } from "./errors.js";
import { Reader } from "./reader.js";
import { Writer } from "./writer.js";
import { FrameReader } from "./framing.js";
import { Intent, buildStatusResponse, parseHandshake, parseLoginStart } from "./packets.js";
import { serializeStatus } from "./status.js";

describe("VarInt round-trip", () => {
	const cases = [0, 1, 2, 127, 128, 255, 2147483647, -1, -2147483648, 25565, 764, 776];
	for (const value of cases) {
		it(`round-trips ${value}`, () => {
			const buf = new Writer().writeVarInt(value).toBuffer();
			expect(new Reader(buf).readVarInt()).toBe(value);
		});
	}
});

describe("primitive round-trips", () => {
	it("unsigned short", () => {
		const buf = new Writer().writeUnsignedShort(25565).toBuffer();
		expect(new Reader(buf).readUnsignedShort()).toBe(25565);
	});

	it("long", () => {
		const buf = new Writer().writeLong(123456789012345n).toBuffer();
		expect(new Reader(buf).readLong()).toBe(123456789012345n);
	});

	it("string", () => {
		const buf = new Writer().writeString("mc.example.com").toBuffer();
		expect(new Reader(buf).readString()).toBe("mc.example.com");
	});
});

describe("hostile input is rejected, not crashed", () => {
	it("rejects overlong VarInt (>5 bytes)", () => {
		const buf = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
		expect(() => new Reader(buf).readVarInt()).toThrow(ProtocolError);
	});

	it("signals incomplete on a truncated VarInt", () => {
		const buf = Buffer.from([0x80]); // continuation bit set, no follow-up byte
		expect(() => new Reader(buf).readVarInt()).toThrow(IncompleteError);
	});

	it("rejects a string whose declared length exceeds the cap", () => {
		// VarInt 300 then no data; cap of 16 must reject before allocating.
		const buf = new Writer().writeVarInt(300).toBuffer();
		expect(() => new Reader(buf).readString(16)).toThrow(ProtocolError);
	});

	it("signals incomplete when string bytes have not all arrived", () => {
		const buf = new Writer().writeVarInt(10).writeBytes(Buffer.from("abc")).toBuffer();
		expect(() => new Reader(buf).readString()).toThrow(IncompleteError);
	});
});

describe("FrameReader", () => {
	function framed(packetId: number, body: Buffer): Buffer {
		const payload = new Writer().writeVarInt(packetId).writeBytes(body).toBuffer();
		return new Writer().writeVarInt(payload.length).writeBytes(payload).toBuffer();
	}

	it("parses a handshake frame", () => {
		const body = new Writer()
			.writeVarInt(772)
			.writeString("mc.example.com")
			.writeUnsignedShort(25565)
			.writeVarInt(Intent.Status)
			.toBuffer();
		const fr = new FrameReader();
		fr.push(framed(0x00, body));
		const frame = fr.next();
		expect(frame).not.toBeNull();
		expect(frame!.id).toBe(0x00);
		const hs = parseHandshake(frame!.body);
		expect(hs).toEqual({
			protocolVersion: 772,
			serverAddress: "mc.example.com",
			serverPort: 25565,
			intent: Intent.Status,
		});
	});

	it("reassembles a frame split across chunks", () => {
		const body = new Writer().writeVarInt(772).writeString("h").writeUnsignedShort(25565).writeVarInt(2).toBuffer();
		const full = framed(0x00, body);
		const fr = new FrameReader();
		fr.push(full.subarray(0, 3));
		expect(fr.next()).toBeNull(); // not all bytes yet
		fr.push(full.subarray(3));
		expect(fr.next()).not.toBeNull();
	});

	it("splits two frames coalesced in one chunk", () => {
		const one = framed(0x00, Buffer.from([1]));
		const fr = new FrameReader();
		fr.push(Buffer.concat([one, one]));
		expect(fr.next()).not.toBeNull();
		expect(fr.next()).not.toBeNull();
		expect(fr.next()).toBeNull();
	});

	it("rejects a packet length above the cap", () => {
		const fr = new FrameReader(64);
		fr.push(new Writer().writeVarInt(1_000_000).toBuffer());
		expect(() => fr.next()).toThrow(ProtocolError);
	});
});

describe("login start", () => {
	it("parses username + uuid", () => {
		const uuidBytes = Buffer.from("f84c6a790a4e45e0879fb8f5e5b0d9c1", "hex");
		const body = new Writer().writeString("Steve").writeBytes(uuidBytes).toBuffer();
		const login = parseLoginStart(new Reader(body));
		expect(login.username).toBe("Steve");
		expect(login.uuid).toBe("f84c6a79-0a4e-45e0-879f-b8f5e5b0d9c1");
	});
});

describe("status response", () => {
	it("keeps vanilla field ordering and round-trips through a frame", () => {
		const json = serializeStatus({
			version: { name: "1.21.8", protocol: 772 },
			players: { max: 20, online: 3 },
			description: { text: "A Minecraft Server" },
		});
		expect(json.indexOf('"version"')).toBeLessThan(json.indexOf('"players"'));
		expect(json.indexOf('"players"')).toBeLessThan(json.indexOf('"description"'));
		const packet = buildStatusResponse(json);
		const fr = new FrameReader();
		fr.push(packet);
		const frame = fr.next();
		expect(frame!.id).toBe(0x00);
		expect(frame!.body.readString()).toBe(json);
	});
});
