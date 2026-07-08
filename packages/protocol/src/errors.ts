/** Thrown when bytes cannot be parsed as valid Minecraft protocol data. */
export class ProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProtocolError";
	}
}

/** Thrown when the buffer does not yet hold a complete field/packet; caller should await more bytes. */
export class IncompleteError extends Error {
	constructor(message = "incomplete") {
		super(message);
		this.name = "IncompleteError";
	}
}
