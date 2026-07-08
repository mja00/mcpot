import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FrameReader } from "./framing.js";
import { Intent, parseHandshake, parseLoginStart } from "./packets.js";

// Real bytes captured from our own client against a running daemon (see scratchpad verify script).
// Decoding them guards against regressions in the wire format, not just our own round-trips.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const load = (name: string) => readFileSync(join(fixturesDir, name));

describe("real captured fixtures decode correctly", () => {
	it("status handshake", () => {
		const fr = new FrameReader();
		fr.push(load("handshake_status.bin"));
		const frame = fr.next()!;
		const hs = parseHandshake(frame.body);
		expect(hs.protocolVersion).toBe(772);
		expect(hs.serverAddress).toBe("play.example.net");
		expect(hs.intent).toBe(Intent.Status);
	});

	it("login handshake + login start", () => {
		const hsr = new FrameReader();
		hsr.push(load("handshake_login.bin"));
		expect(parseHandshake(hsr.next()!.body).intent).toBe(Intent.Login);

		const lsr = new FrameReader();
		lsr.push(load("login_start.bin"));
		const login = parseLoginStart(lsr.next()!.body);
		expect(login.username).toBe("ScannerBot");
		expect(login.uuid).toBe("f84c6a79-0a4e-45e0-879f-b8f5e5b0d9c1");
	});
});
