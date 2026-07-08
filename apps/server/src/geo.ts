import path from "node:path";
import { open, type AsnResponse, type CountryResponse, type Reader } from "maxmind";

export interface GeoLookup {
	countryCode: string | null;
	asn: number | null;
	asOrg: string | null;
}

export interface GeoService {
	lookup(ip: string | null): GeoLookup;
}

const NULL_LOOKUP: GeoLookup = { countryCode: null, asn: null, asOrg: null };

/** Used in tests and whenever mmdb files aren't available — everything downstream stores nulls. */
export const noopGeo: GeoService = { lookup: () => NULL_LOOKUP };

/**
 * GeoLite2 lookups backed by mmdb files in `dir` (written by the geoipupdate sidecar in prod).
 * watchForUpdates hot-reloads when the sidecar refreshes a database, so the server never restarts
 * for geo updates. Missing files degrade to null lookups with a single boot warning.
 */
export async function createGeoService(dir: string): Promise<GeoService> {
	let country: Reader<CountryResponse> | null = null;
	let asn: Reader<AsnResponse> | null = null;
	try {
		country = await open<CountryResponse>(path.join(dir, "GeoLite2-Country.mmdb"), { watchForUpdates: true });
	} catch {
		/* degrade below */
	}
	try {
		asn = await open<AsnResponse>(path.join(dir, "GeoLite2-ASN.mmdb"), { watchForUpdates: true });
	} catch {
		/* degrade below */
	}
	if (!country && !asn) {
		process.stderr.write(`geo: no GeoLite2 databases in ${dir}; connections will not be geo-enriched\n`);
		return noopGeo;
	}

	return {
		lookup(ip: string | null): GeoLookup {
			if (!ip) return NULL_LOOKUP;
			try {
				const c = country?.get(ip);
				const a = asn?.get(ip);
				return {
					countryCode: c?.country?.iso_code ?? c?.registered_country?.iso_code ?? null,
					asn: a?.autonomous_system_number ?? null,
					asOrg: a?.autonomous_system_organization ?? null,
				};
			} catch {
				// maxmind throws on malformed addresses; treat them as unknown rather than failing ingest.
				return NULL_LOOKUP;
			}
		},
	};
}
