import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createClient, createDb } from "../db/client.ts";
import { connections } from "../db/schema.ts";
import { createGeoService } from "../geo.ts";

/**
 * One-off geo backfill for rows ingested before enrichment existed. Updates per distinct IP (far
 * fewer statements than per-row) and only touches rows still missing a country, so it's re-runnable.
 * Usage: node --experimental-transform-types src/scripts/backfill-geo.ts [--dry-run]
 */
const dryRun = process.argv.includes("--dry-run");
const geo = await createGeoService(process.env.GEOIP_DIR ?? "/data/geoip");
const client = createClient();
const db = createDb(client);

const ips = await db
	.selectDistinct({ srcIp: connections.srcIp })
	.from(connections)
	.where(and(isNotNull(connections.srcIp), isNull(connections.countryCode)));

let updated = 0;
let resolved = 0;
for (const { srcIp } of ips) {
	const g = geo.lookup(srcIp);
	if (!g.countryCode && !g.asn) continue;
	resolved++;
	if (dryRun) {
		process.stdout.write(`${srcIp} -> ${g.countryCode ?? "??"} AS${g.asn ?? "?"} ${g.asOrg ?? ""}\n`);
		continue;
	}
	const res = await db
		.update(connections)
		.set({ countryCode: g.countryCode, asn: g.asn, asOrg: g.asOrg })
		.where(and(eq(connections.srcIp, srcIp!), isNull(connections.countryCode)))
		.returning({ eventId: connections.eventId });
	updated += res.length;
}

process.stdout.write(
	dryRun
		? `dry-run: ${ips.length} distinct IPs missing geo, ${resolved} resolvable\n`
		: `backfilled ${updated} rows across ${resolved}/${ips.length} distinct IPs\n`,
);
await client.end();
