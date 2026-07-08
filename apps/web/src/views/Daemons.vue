<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createToken, fetchDaemons, revokeDaemon, type DaemonListItem } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";
import { useToast } from "../composables/useToast";
import { isOnline, timeAgo } from "../lib/format";
import PageHeader from "../components/PageHeader.vue";
import Panel from "../components/Panel.vue";
import StatusDot from "../components/StatusDot.vue";
import UiBadge from "../components/ui/UiBadge.vue";
import UiButton from "../components/ui/UiButton.vue";
import UiDialog from "../components/ui/UiDialog.vue";
import UiAlertDialog from "../components/ui/UiAlertDialog.vue";
import UiTooltip from "../components/ui/UiTooltip.vue";

const guard = useAuthGuard();
const { toast } = useToast();
const daemons = ref<DaemonListItem[]>([]);
const newToken = ref<string | null>(null);
const tokenOpen = ref(false);
const copied = ref(false);
const revokeTarget = ref<DaemonListItem | null>(null);
const revokeOpen = ref(false);

async function load(): Promise<void> {
	const d = await guard(() => fetchDaemons());
	if (d) daemons.value = d;
}

async function mint(): Promise<void> {
	const res = await guard(() => createToken());
	if (res) {
		newToken.value = res.token;
		copied.value = false;
		tokenOpen.value = true;
	}
}

async function copyToken(): Promise<void> {
	if (!newToken.value) return;
	await navigator.clipboard.writeText(newToken.value);
	copied.value = true;
}

function askRevoke(d: DaemonListItem): void {
	revokeTarget.value = d;
	revokeOpen.value = true;
}

async function confirmRevoke(): Promise<void> {
	const target = revokeTarget.value;
	if (!target) return;
	await guard(() => revokeDaemon(target.id));
	toast(`Revoked ${target.hostname ?? target.id.slice(0, 8)}`, { description: "The daemon must re-enroll to get a new key.", tone: "good" });
	await load();
}

function state(d: DaemonListItem): "good" | "off" | "critical" {
	return d.revoked ? "critical" : isOnline(d.lastSeenAt) ? "good" : "off";
}

onMounted(() => void load());
</script>

<template>
	<section>
		<PageHeader title="Daemons" eyebrow="Honeypot network">
			<template #actions>
				<UiButton variant="primary" @click="mint">Enroll new daemon</UiButton>
			</template>
		</PageHeader>

		<Panel title="Fleet">
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-sm tabular-nums">
					<thead>
						<tr class="[&>th]:border-b [&>th]:border-grid [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-mono [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.14em] [&>th]:uppercase [&>th]:text-ink-muted">
							<th>Status</th>
							<th>Hostname</th>
							<th>Version</th>
							<th>Last seen</th>
							<th>
								<UiTooltip content="Events buffered on the daemon awaiting delivery — nonzero means it can't reach the server">
									<span>Queue</span>
								</UiTooltip>
							</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="d in daemons" :key="d.id" class="[&>td]:border-b [&>td]:border-grid [&>td]:px-3 [&>td]:py-2">
							<td>
								<span class="inline-flex items-center gap-2">
									<StatusDot :state="state(d)" :pulse="state(d) === 'good'" />
									<UiBadge :tone="d.revoked ? 'critical' : isOnline(d.lastSeenAt) ? 'good' : 'neutral'">
										{{ d.revoked ? "revoked" : isOnline(d.lastSeenAt) ? "online" : "offline" }}
									</UiBadge>
								</span>
							</td>
							<td class="font-mono text-ink">{{ d.hostname ?? "—" }}</td>
							<td class="font-mono text-ink-secondary">{{ d.versionName }}</td>
							<td class="text-ink-secondary">{{ timeAgo(d.lastSeenAt) }}</td>
							<td class="font-mono text-ink-secondary">{{ d.queueDepth ?? "—" }}</td>
							<td class="text-right">
								<UiButton v-if="!d.revoked" variant="danger" size="sm" @click="askRevoke(d)">Revoke</UiButton>
							</td>
						</tr>
						<tr v-if="daemons.length === 0">
							<td colspan="6" class="px-3 py-6 text-center text-ink-muted">no daemons enrolled yet — mint an enrollment token to add one</td>
						</tr>
					</tbody>
				</table>
			</div>
		</Panel>

		<UiDialog
			v-model:open="tokenOpen"
			title="Enrollment token"
			description="Single-use. Set it as MCPOT_ENROLLMENT_TOKEN on the new host — it can't be shown again after this dialog closes."
		>
			<!-- {{ }} keeps the token inert; it's ours but the habit is uniform. -->
			<pre class="m-0 overflow-x-auto rounded-lg bg-page p-3 font-mono text-sm text-ink">{{ newToken }}</pre>
			<div class="mt-4 flex justify-end gap-2">
				<UiButton variant="primary" @click="copyToken">{{ copied ? "Copied" : "Copy token" }}</UiButton>
				<UiButton variant="ghost" @click="tokenOpen = false">Done</UiButton>
			</div>
		</UiDialog>

		<UiAlertDialog
			v-model:open="revokeOpen"
			title="Revoke this daemon?"
			:description="`${revokeTarget?.hostname ?? revokeTarget?.id.slice(0, 8) ?? ''} loses its API key immediately and must re-enroll with a fresh token to rejoin the fleet.`"
			confirm-label="Revoke"
			danger
			@confirm="confirmRevoke"
		/>
	</section>
</template>
