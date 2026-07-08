/**
 * Curated release version → protocol-number pairs. Floor is 1.20.2 (764): from there Login Start is
 * a clean name+UUID with no version-dependent chat-signature fields, so the codec never has to branch.
 * `version.name` in a status response must always match its `protocol` or scanners flag the mismatch.
 * Spot-check against real handshakes; protocol numbers occasionally shift late in a release cycle.
 */
export interface MinecraftVersion {
	readonly name: string;
	readonly protocol: number;
}

export const VERSIONS: readonly MinecraftVersion[] = [
	{ name: "1.20.2", protocol: 764 },
	{ name: "1.20.4", protocol: 765 },
	{ name: "1.20.6", protocol: 766 },
	{ name: "1.21.1", protocol: 767 },
	{ name: "1.21.3", protocol: 768 },
	{ name: "1.21.4", protocol: 769 },
	{ name: "1.21.5", protocol: 770 },
	{ name: "1.21.6", protocol: 771 },
	{ name: "1.21.8", protocol: 772 },
	{ name: "26.2", protocol: 776 },
];

/** Lowest protocol we present/support; below this Login Start layout differs (pre-1.20.2). */
export const MIN_SUPPORTED_PROTOCOL = 764;

const BY_PROTOCOL = new Map(VERSIONS.map((v) => [v.protocol, v]));

export function versionForProtocol(protocol: number): MinecraftVersion | undefined {
	return BY_PROTOCOL.get(protocol);
}

/** Latest known release, used as a sensible default persona version. */
export const LATEST_VERSION: MinecraftVersion = VERSIONS[VERSIONS.length - 1]!;
