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
		}}
	>
		?
	</button>
	<div class="help-position" hidden={!open}>
		<section
			id="broker-permissions-help"
			class="help-content"
			aria-label="Broker setup and topic permissions"
		>
			<h2>Broker permissions</h2>
			<p class="help-intro">Set up accounts and topic access in your MQTT broker.</p>
			<ol class="setup-steps">
				<li>
					<h3>Connect the server</h3>
					<p>
						Create a separate server identity and save its credentials in KAGE. Run <strong>Test connection
						</strong> to check network access, TLS and login. No device is needed.
					</p>
				</li>
				<li>
					<h3>Add a device account</h3>
					<p>
						Register a Hub or Client in KAGE. Create its account in your broker using the issued
						credentials, then apply the topic permissions below. Verify access before confirming
						provisioning under Hubs or Clients.
					</p>
				</li>
				<li>
					<h3>Test device permissions</h3>
					<p>
						Checks login and message delivery in both directions using a registered account. Client
						tests also check that publishing to another device is denied. Requires MQTT 5. The
						physical device can be offline.
					</p>
				</li>
			</ol>
			<p class="help-note">
				Broker connections use the server credentials. Device traffic starts after the permission
				test passes. A failed retest pauses device traffic and keeps the broker connection open.
			</p>
			<details class="topic-reference">
				<summary>Topic permissions reference</summary>
				<p class="reference-key">
					<code>H</code> = Hub ID, <code>C</code> = PC ID, <code>U</code> = device username. Read means
					subscribe. Write means publish.
				</p>
				<section class="account-permissions" aria-label="Server account permissions">
					<h3>Server account</h3>
					<dl>
						<dt>Read</dt>
						<dd>
							<ul class="topic-list">
								<li><code>kage/client/setup/by-user/+/request</code></li>
								<li><code>kage/client/+/+/request</code></li>
								<li><code>kage/client/+/+/presence</code></li>
								<li><code>kage/hub/live/+/+</code></li>
							</ul>
						</dd>
						<dt>Write</dt>
						<dd>
							<ul class="topic-list">
								<li><code>kage/client/setup/by-user/+/response/+</code></li>
								<li><code>kage/client/+/+/response</code></li>
								<li><code>kage/client/+/+/state</code></li>
								<li><code>kage/client/+/+/command</code></li>
								<li><code>kage/hub/live/+/ping_response</code></li>
								<li><code>kage/hub/live/+/identify</code></li>
								<li><code>kage/hub/live/+/pairing_response/+</code></li>
								<li><code>kage/hub/live/+/unpair_response/+</code></li>
							</ul>
						</dd>
					</dl>
				</section>
				<section class="account-permissions" aria-label="Hub account permissions">
					<h3>Hub account</h3>
					<p>Topic prefix: <code>kage/hub/live/H/</code></p>
					<dl>
						<dt>Write</dt>
						<dd>
							<code>ping_request</code>, <code>status</code>, <code>pairing_request</code>,
							<code>pairing_confirm</code>, <code>unpair_request</code>,
							<code>unpair_confirm</code>, <code>identify_result</code>
						</dd>
						<dt>Read</dt>
						<dd>
							<code>ping_response</code>, <code>identify</code>, <code>pairing_response/+</code>,
							<code>unpair_response/+</code>
						</dd>
					</dl>
					<p class="reference-key">Hub wildcard permissions are supported.</p>
				</section>
				<section class="account-permissions" aria-label="Client account permissions">
					<h3>Client account</h3>
					<dl>
						<dt>Write</dt>
						<dd>
							<ul class="topic-list">
								<li><code>kage/client/setup/by-user/U/request</code></li>
								<li><code>kage/client/H/C/request</code></li>
								<li><code>kage/client/H/C/presence</code></li>
							</ul>
						</dd>
						<dt>Read</dt>
						<dd>
							<ul class="topic-list">
								<li><code>kage/client/setup/by-user/U/response/+</code></li>
								<li><code>kage/client/H/C/response</code></li>
								<li><code>kage/client/H/C/state</code></li>
								<li><code>kage/client/H/C/command</code></li>
							</ul>
						</dd>
					</dl>
					<p class="reference-key">
						Deny access to other devices and the legacy shared setup topics. Apply the same
						restrictions to retained messages and existing sessions.
					</p>
				</section>
				<p class="help-note">
					A pass covers one account and sampled topics. Use your broker tools to verify all device
					accounts, remaining topics and denied reads.
				</p>
			</details>
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
		padding: 24px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 12px 40px #0006;
		color: var(--text-secondary);
		font-size: 13px;
	}
	h2,
	h3 {
		color: var(--text);
	}
	h2 {
		margin: 0 0 6px;
		font-size: 18px;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 13px;
		font-weight: 600;
	}
	p {
		margin: 0;
		font-size: 13px;
		line-height: 1.65;
	}
	.help-intro {
		color: var(--muted);
	}
	.setup-steps {
		list-style: none;
		counter-reset: setup;
		display: grid;
		gap: 20px;
		margin: 24px 0 20px;
		padding: 0;
	}
	.setup-steps > li {
		position: relative;
		padding-left: 38px;
		counter-increment: setup;
	}
	.setup-steps > li::before {
		content: counter(setup);
		position: absolute;
		left: 0;
		top: 0;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--surface-raised);
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}
	strong {
		color: var(--text);
		font-weight: 600;
	}
	.help-note {
		padding: 12px 14px;
		border-left: 2px solid var(--accent-border);
		border-radius: 0 6px 6px 0;
		background: var(--surface-raised);
		font-size: 12px;
	}
	.topic-reference {
		margin-top: 20px;
		padding-top: 16px;
	}
	.topic-reference summary {
		margin-bottom: 0;
		color: var(--text);
		font-size: 13px;
	}
	.topic-reference[open] summary {
		margin-bottom: 16px;
	}
	.reference-key {
		color: var(--muted);
		font-size: 12px;
	}
	.account-permissions {
		margin: 18px 0;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	dl {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 10px 12px;
		margin: 12px 0;
	}
	dt {
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.8;
	}
	dd {
		min-width: 0;
		margin: 0;
		line-height: 1.8;
	}
	.topic-list {
		list-style: none;
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
	}
	code {
		overflow-wrap: anywhere;
		font-size: 11px;
	}
	@media (max-width: 760px) {
		.broker-help {
			bottom: 16px;
			right: 16px;
		}
	}
</style>
