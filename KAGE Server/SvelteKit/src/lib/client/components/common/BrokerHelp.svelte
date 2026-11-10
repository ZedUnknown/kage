<script lang="ts">
	let pinned = $state(false);
	let hovered = $state(false);
	let focused = $state(false);
	let dismissed = $state(false);
	const open = $derived(!dismissed && (pinned || hovered || focused));
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			pinned = false;
			dismissed = true;
		}
	}}
/>

<aside
	class="broker-help"
	aria-label="Broker permissions help"
	onmouseenter={() => {
		hovered = true;
		dismissed = false;
	}}
	onmouseleave={() => (hovered = false)}
	onfocusin={() => {
		focused = true;
		dismissed = false;
	}}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused = false;
	}}
>
	<button
		type="button"
		class="help-trigger secondary"
		aria-label="Broker provisioning and ACL help"
		aria-expanded={open}
		aria-controls="broker-permissions-help"
		onclick={() => {
			if (pinned) {
				pinned = false;
				dismissed = true;
			} else {
				pinned = true;
				dismissed = false;
			}
		}}>?</button
	>
	<div class="help-position" hidden={!open}>
		<section
			id="broker-permissions-help"
			class="help-content"
			aria-label="Provisioning checklist and broker permissions"
		>
			<h2>Broker permissions</h2>
			<p>
				Create a separate server identity with read access only to each registered Hub’s
				ping_request, status, identify_result, pairing and unpairing request/confirm topics, and
				each Client’s request and extension/request topics. Give it write access to matching
				response, state and command topics, plus each Hub’s identify topic. Hub permissions may use
				wildcards such as #.
			</p>
			<p>
				For Hub H, allow H to publish <code>kage/hub/live/H/ping_request</code>, status,
				pairing_request, pairing_confirm, unpair_request, unpair_confirm and identify_result;
				subscribe to
				<code>kage/hub/live/H/ping_response</code>, identify, pairing_response/+ and
				unpair_response/+. The worker replies only for confirmed Hubs on a broker that passed its
				device permission test.
			</p>
			<p>
				For Client C on Hub H, allow publish to <code>kage/client/H/C/request</code> and
				extension/request; subscribe to <code>kage/client/H/C/state</code>, command and response.
				Deny all other device namespaces. Shared Client setup remains blocked. Apply equivalent
				restrictions to retained messages and existing sessions.
			</p>
			<p>
				Confirm after testing authentication and delivery on the required topics. Client identities
				also require denied cross-device access.
			</p>
			<h3>Test connection</h3>
			<p>
				Use Test connection as soon as you save a broker. It checks network access, TLS when
				enabled, and authentication using the saved server credentials. No Hub or Client is
				required. This check does not verify topic permissions or start the MQTT worker.
			</p>
			<h3>Test device permissions</h3>
			<p>
				First register a Hub or Client and provision its credentials and ACL on your broker. The
				test uses the first available registered identity, preferring confirmed credentials. It
				checks server and device authentication, sends a non-retained probe in both directions
				(including the Hub startup ping topics). Hub wildcard permissions are accepted; only Client
				tests require rejection of a publish into another device namespace. MQTT 5 is required.
				Temporary connections use unique IDs; the physical device does not need to be online.
			</p>
			<p>
				A pass covers this identity and these sampled topics. Check the remaining topics, other
				devices, denied reads, retained messages and existing sessions with your broker’s tooling.
				The MQTT worker connects only after this test passes; a failed permission retest clears the
				previous pass.
			</p>
		</section>
	</div>
</aside>

<style>
	.broker-help {
		position: fixed;
		bottom: 20px;
		right: 24px;
		z-index: 25;
	}
	.help-trigger {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		font-size: 20px;
		box-shadow: 0 4px 20px #0005;
	}
	.help-position {
		position: absolute;
		bottom: 100%;
		right: 0;
		padding-bottom: 10px;
		width: min(520px, calc(100vw - 32px));
	}
	.help-content {
		max-height: min(640px, calc(100dvh - 100px));
		overflow: auto;
		padding: 20px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface-raised);
		box-shadow: 0 12px 40px #0006;
		color: var(--text-secondary);
		font-size: 13px;
	}
	h2,
	h3 {
		color: var(--text);
	}
	h2 {
		margin: 0 0 12px;
	}
	h3 {
		margin: 20px 0 10px;
	}
	p {
		margin: 0 0 12px;
	}
	p:last-child {
		margin-bottom: 0;
	}
	code {
		overflow-wrap: anywhere;
	}
	@media (max-width: 760px) {
		.broker-help {
			bottom: 16px;
			right: 16px;
		}
	}
</style>
