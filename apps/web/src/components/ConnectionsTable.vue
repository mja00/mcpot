<script setup lang="ts">
import type { RecentConnection } from "../api";
import { fmtDateTime, fmtTime } from "../lib/format";
import CountryFlag from "./CountryFlag.vue";
import UiBadge from "./ui/UiBadge.vue";

const props = withDefaults(
	defineProps<{
		rows: RecentConnection[];
		showSrcIp?: boolean;
		showDaemon?: boolean;
		showProtocol?: boolean;
		timeStyle?: "time" | "datetime";
		/** Event ids that just arrived over the stream — briefly pulsed amber. */
		freshIds?: Set<string>;
		emptyText?: string;
	}>(),
	{ showSrcIp: true, showDaemon: true, showProtocol: false, timeStyle: "time", freshIds: undefined, emptyText: "no connections yet" },
);

const intentTone = {
	status: "neutral",
	login: "accent",
	transfer: "warn",
	legacy: "warn",
	unknown: "critical",
} as const;

function tone(intent: string): "neutral" | "accent" | "warn" | "critical" {
	return intentTone[intent as keyof typeof intentTone] ?? "neutral";
}

function fmt(iso: string): string {
	return props.timeStyle === "time" ? fmtTime(iso) : fmtDateTime(iso);
}

const colspan = 4 + (props.showSrcIp ? 1 : 0) + (props.showDaemon ? 1 : 0) + (props.showProtocol ? 1 : 0);
</script>

<template>
	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-sm tabular-nums">
			<thead>
				<tr class="[&>th]:border-b [&>th]:border-grid [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-mono [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.14em] [&>th]:uppercase [&>th]:text-ink-muted">
					<th>Time</th>
					<th v-if="showSrcIp">Source IP</th>
					<th v-if="showDaemon">Daemon</th>
					<th>Hostname used</th>
					<th v-if="showProtocol">Protocol</th>
					<th>Intent</th>
					<th>Username</th>
				</tr>
			</thead>
			<tbody>
				<!-- {{ }} escapes attacker-controlled strings; never v-html. -->
				<tr
					v-for="c in rows"
					:key="c.eventId"
					class="transition-colors [&>td]:border-b [&>td]:border-grid [&>td]:px-3 [&>td]:py-2"
					:class="freshIds?.has(c.eventId) ? 'motion-safe:animate-feed-in' : ''"
				>
					<td class="whitespace-nowrap text-ink-secondary">{{ fmt(c.receivedAt) }}</td>
					<td v-if="showSrcIp" class="font-mono text-ink">
						<span class="mr-1.5"><CountryFlag :country-code="c.countryCode" :asn="c.asn" :as-org="c.asOrg" /></span>{{ c.srcIp ?? "—" }}
					</td>
					<td v-if="showDaemon" class="max-w-44 truncate font-mono text-ink">{{ c.daemonHostname ?? c.daemonId.slice(0, 8) }}</td>
					<td class="max-w-64 truncate font-mono text-ink-secondary">{{ c.serverAddress ?? "—" }}</td>
					<td v-if="showProtocol" class="font-mono text-ink-secondary">{{ c.protocolVersion ?? "—" }}</td>
					<td><UiBadge :tone="tone(c.intent)">{{ c.intent }}</UiBadge></td>
					<td class="font-mono text-ink-secondary">{{ c.username ?? "—" }}</td>
				</tr>
				<tr v-if="rows.length === 0">
					<td :colspan="colspan" class="px-3 py-6 text-center text-ink-muted">{{ emptyText }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
