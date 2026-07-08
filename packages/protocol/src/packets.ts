import type { Reader } from "./reader.js";
import { Writer } from "./writer.js";

/** Handshake `Next State` / intent values. Transfer (3) exists only in 1.20.5+. */
export enum Intent {
	Status = 1,
	Login = 2,
	Transfer = 3,
}

/** Vanilla caps the handshake address at 255; proxies (BungeeCord/Velocity) append data, so allow headroom. */
export const MAX_SERVER_ADDRESS_BYTES = 512;
/** Usernames are capped at 16 by the protocol. */
export const MAX_USERNAME_BYTES = 16;

export interface Handshake {
	readonly protocolVersion: number;
	readonly serverAddress: string;
	readonly serverPort: number;
	readonly intent: Intent;
}

export interface LoginStart {
	readonly username: string;
	readonly uuid: string;
}

/** Parse a Handshake body (packet id already consumed by the frame reader). */
export function parseHandshake(body: Reader): Handshake {
	const protocolVersion = body.readVarInt();
	const serverAddress = body.readString(MAX_SERVER_ADDRESS_BYTES);
	const serverPort = body.readUnsignedShort();
	const intent = body.readVarInt();
	return { protocolVersion, serverAddress, serverPort, intent };
}

/** Parse a Login Start body. From 1.20.2+ (our floor) this is a clean name + 16-byte UUID. */
export function parseLoginStart(body: Reader): LoginStart {
	const username = body.readString(MAX_USERNAME_BYTES);
	const uuid = body.readUuid();
	return { username, uuid };
}

/** Read the client timestamp from a Ping Request body. */
export function parsePing(body: Reader): bigint {
	return body.readLong();
}

/** Wrap a packet body (id + fields) in its VarInt length prefix. */
function frame(packetId: number, body: Writer): Buffer {
	const payload = new Writer().writeVarInt(packetId).writeBytes(body.toBuffer()).toBuffer();
	return new Writer().writeVarInt(payload.length).writeBytes(payload).toBuffer();
}

/** Clientbound Status Response (0x00): a single JSON string. */
export function buildStatusResponse(json: string): Buffer {
	return frame(0x00, new Writer().writeString(json));
}

/** Clientbound Pong (0x01): echo the client's timestamp so it can measure latency. */
export function buildPong(timestamp: bigint): Buffer {
	return frame(0x01, new Writer().writeLong(timestamp));
}

/** Clientbound login Disconnect (0x00): a JSON chat-component reason. */
export function buildLoginDisconnect(reasonJson: string): Buffer {
	return frame(0x00, new Writer().writeString(reasonJson));
}
