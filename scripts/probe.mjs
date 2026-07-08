// Generate a hit against a running daemon: one status ping + one login attempt. This is what a
// scanner/client does, so it produces two ConnectionEvents the daemon captures and phones home.
//   node scripts/probe.mjs [host] [port]
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "protocol", "dist", "index.js");
const { Writer, FrameReader, Intent } = await import(dist);

const host = process.argv[2] ?? "127.0.0.1";
const port = Number(process.argv[3] ?? 25565);

const frame = (id, body) => {
	const payload = new Writer().writeVarInt(id).writeBytes(body).toBuffer();
	return new Writer().writeVarInt(payload.length).writeBytes(payload).toBuffer();
};
const handshake = (intent) =>
	frame(0x00, new Writer().writeVarInt(772).writeString(host).writeUnsignedShort(port).writeVarInt(intent).toBuffer());

function statusPing() {
	return new Promise((resolve, reject) => {
		const frames = new FrameReader();
		let handled = false;
		const c = net.connect(port, host, () => {
			c.write(handshake(Intent.Status));
			c.write(frame(0x00, Buffer.alloc(0)));
		});
		c.on("data", (chunk) => {
			if (handled) return; // ignore the pong that follows the status response
			frames.push(chunk);
			const f = frames.next();
			if (f) {
				handled = true;
				const status = JSON.parse(f.body.readString());
				console.log(`status ping  -> ${status.version.name} (protocol ${status.version.protocol}), ${status.players.online}/${status.players.max} players`);
				c.write(frame(0x01, new Writer().writeLong(1n).toBuffer()));
				c.end();
				resolve();
			}
		});
		c.on("error", reject);
	});
}

function loginAttempt() {
	return new Promise((resolve) => {
		const name = `probe_${randomBytes(3).toString("hex")}`;
		const c = net.connect(port, host, () => {
			c.write(handshake(Intent.Login));
			c.write(frame(0x00, new Writer().writeString(name).writeBytes(randomBytes(16)).toBuffer()));
		});
		c.on("data", () => {});
		c.on("close", () => {
			console.log(`login attempt -> sent username "${name}"`);
			resolve();
		});
		c.on("error", () => resolve());
	});
}

await statusPing();
await loginAttempt();
console.log(`\nprobed ${host}:${port} — 2 events captured. They flush to the server within ~5s.`);
