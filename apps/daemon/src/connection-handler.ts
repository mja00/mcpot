import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import type { ConnectionEvent, IntentKind, Persona } from "@mcpot/shared";
import {
	FrameReader,
	Intent,
	LEGACY_PING_BYTE,
	ProtocolError,
	type Reader,
	buildLoginDisconnect,
	buildPong,
	buildStatusResponse,
	parseHandshake,
	parseLoginStart,
	parsePing,
} from "@mcpot/protocol";
import { buildStatusJson } from "./persona.ts";
import { normalizeIp } from "./net-util.ts";

type State = "handshake" | "status" | "login" | "done";

export interface HandlerConfig {
	persona: Persona;
	handshakeTimeoutMs: number;
	connectionTimeoutMs: number;
}

/** Kick messages a real server might send; varying them avoids a fixed honeypot signature. */
const DISCONNECT_REASONS = [
	"The server is full!",
	"You are not white-listed on this server!",
	"Failed to verify username!",
	"Connection throttled! Please wait before reconnecting.",
];

/**
 * Drives one TCP connection through the Minecraft handshake and either the status-ping or login
 * flow, capturing exactly one ConnectionEvent. It is deliberately forgiving of hostile input:
 * a ProtocolError just ends the connection with a fingerprint note rather than throwing outward.
 */
export class ConnectionHandler {
	private state: State = "handshake";
	private readonly frames = new FrameReader();
	private emitted = false;

	private protocolVersion: number | null = null;
	private serverAddress = "";
	private serverPort = 0;
	private intent: IntentKind = "unknown";
	private pingCompleted = false;
	private username: string | null = null;
	private playerUuid: string | null = null;
	private fingerprint: string | null = null;

	private readonly srcIp: string;
	private readonly srcPort: number;
	private handshakeTimer?: NodeJS.Timeout;
	private totalTimer?: NodeJS.Timeout;

	constructor(
		private readonly socket: Socket,
		private readonly config: HandlerConfig,
		private readonly onEvent: (event: ConnectionEvent) => void,
	) {
		this.srcIp = normalizeIp(socket.remoteAddress ?? "unknown");
		this.srcPort = socket.remotePort ?? 0;
	}

	start(): void {
		this.socket.on("data", (chunk: Buffer) => this.onData(chunk));
		this.socket.on("error", () => this.finish());
		this.socket.on("close", () => this.finish());

		this.handshakeTimer = setTimeout(() => {
			this.fingerprint ??= "handshake_timeout"; // slowloris / never completes handshake
			this.destroy();
		}, this.config.handshakeTimeoutMs);
		this.totalTimer = setTimeout(() => this.destroy(), this.config.connectionTimeoutMs);
	}

	private onData(chunk: Buffer): void {
		try {
			this.frames.push(chunk);
			this.pump();
		} catch (err) {
			this.fingerprint = err instanceof ProtocolError ? `protocol_error:${err.message}` : "read_error";
			this.destroy();
		}
	}

	private pump(): void {
		// The legacy 0xFE ping is not VarInt-framed, so detect it before the frame reader chokes on it.
		if (this.state === "handshake" && this.frames.peekByte() === LEGACY_PING_BYTE) {
			this.intent = "legacy";
			this.fingerprint = "legacy_ping";
			this.destroy();
			return;
		}
		for (;;) {
			const frame = this.frames.next();
			if (!frame) return;
			this.handleFrame(frame.id, frame.body);
			if (this.state === "done") return;
		}
	}

	private handleFrame(id: number, body: Reader): void {
		switch (this.state) {
			case "handshake": {
				if (id !== 0x00) {
					this.fingerprint = `unexpected_handshake_id:${id}`;
					this.destroy();
					return;
				}
				const hs = parseHandshake(body);
				this.protocolVersion = hs.protocolVersion;
				this.serverAddress = hs.serverAddress;
				this.serverPort = hs.serverPort;
				if (this.handshakeTimer) clearTimeout(this.handshakeTimer);

				if (hs.intent === Intent.Status) {
					this.intent = "status";
					this.state = "status";
				} else if (hs.intent === Intent.Login) {
					this.intent = "login";
					this.state = "login";
				} else if (hs.intent === Intent.Transfer) {
					this.intent = "transfer";
					this.destroy();
				} else {
					this.intent = "unknown";
					this.fingerprint = `unknown_intent:${hs.intent}`;
					this.destroy();
				}
				return;
			}
			case "status": {
				if (id === 0x00) {
					this.socket.write(buildStatusResponse(buildStatusJson(this.config.persona, this.config.persona.basePlayers)));
				} else if (id === 0x01) {
					this.pingCompleted = true;
					this.socket.write(buildPong(parsePing(body)));
					this.destroy();
				}
				return;
			}
			case "login": {
				if (id === 0x00) {
					const login = parseLoginStart(body);
					this.username = login.username;
					this.playerUuid = login.uuid;
					const reason = DISCONNECT_REASONS[Math.floor(Math.random() * DISCONNECT_REASONS.length)]!;
					this.socket.write(buildLoginDisconnect(JSON.stringify({ text: reason })));
					this.destroy();
				}
				return;
			}
			case "done":
				return;
		}
	}

	private destroy(): void {
		if (!this.socket.destroyed) this.socket.end();
		this.finish();
	}

	private finish(): void {
		if (this.emitted) return;
		this.emitted = true;
		this.state = "done";
		if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
		if (this.totalTimer) clearTimeout(this.totalTimer);

		this.onEvent({
			eventId: randomUUID(),
			observedAt: new Date().toISOString(),
			srcIp: this.srcIp,
			srcPort: this.srcPort,
			protocolVersion: this.protocolVersion,
			serverAddress: this.serverAddress,
			serverPort: this.serverPort,
			intent: this.intent,
			pingCompleted: this.pingCompleted,
			username: this.username,
			playerUuid: this.playerUuid,
			fingerprint: this.fingerprint,
		});
	}
}
