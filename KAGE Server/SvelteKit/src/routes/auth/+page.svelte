<script lang="ts">
	import KageBrand from '#lib/client/components/common/KageBrand.svelte';
	import SensitiveInput from '#lib/client/components/common/SensitiveInput.svelte';
	import { toast } from 'svelte-sonner';
	import Spinner from '#lib/client/components/common/Spinner.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let registration = $state(false);
	let busy = $state(false);
	let email = $state('');

	async function request(action: string, body: object) {
		if (busy) return;

		busy = true;

		try {
			const response = await fetch(`/api/auth/${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json();

			if (!response.ok) throw new Error(result.error || 'Request failed');

			if (action === 'verify') {
				toast.success('Check your inbox for your verification code.');
			} else {
				window.location.assign('/');
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Connection unavailable');
		} finally {
			busy = false;
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void request(
			registration ? 'register' : 'login',
			Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement))
		);
	}
</script>

<svelte:head>
	<title>KAGE - Workspace security</title>
	<meta
		name="description"
		content="Manage your KAGE workspace, devices and security operations."
	/>
</svelte:head>
<main class="auth-shell">
	<section class="auth-intro">
		<KageBrand />
		<div>
			<p class="eyebrow">Workspace security</p>
			<h1>Manage your<br />workspace.</h1>
			<p>Connect your devices, map PCs to Chair Nodes and manage workspace security.</p>
		</div>
		<p class="muted">Connect your own devices and MQTT broker.</p>
	</section>
	<section class="auth-form">
		<p class="eyebrow">KAGE ADMIN</p>
		<h2>{registration ? 'Create your workspace' : 'Welcome back'}</h2>
		<p>
			{registration
				? 'Register as the administrator of a new workspace.'
				: 'Sign in to manage your workspace.'}
		</p>
		<form onsubmit={submit}>
			{#if registration}<label>Full name<input name="full_name" autocomplete="name" required maxlength="128" />
			</label>{/if}
			<label>Email address<input
					name="email"
					type="email"
					autocomplete="email"
					bind:value={email}
					required
					maxlength="254"
				/>
			</label>
			{#if registration && data.verificationRequired}
				<button
					type="button"
					class="secondary"
					disabled={busy || !email}
					onclick={() => request('verify', { email })}
				>
					Send verification code
				</button>
				<label>Verification code<input
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						required
						pattern="[0-9]{6}"
						maxlength="6"
					/>
				</label>
			{/if}
			<div class="form-field">
				<label for="auth-password">Password</label><SensitiveInput
					id="auth-password"
					name="password"
					type="password"
					autocomplete={registration ? 'new-password' : 'current-password'}
					minlength={registration ? 12 : undefined}
					maxlength={256}
					required
				/>
			</div>
			{#if registration}<small>At least 12 characters. {data.verificationRequired
						? ''
						: 'Email verification is currently disabled.'}
			</small>{/if}
			<button disabled={busy}>{#if busy}<Spinner />{/if}{busy
					? 'Working...'
					: registration
						? 'Create workspace'
						: 'Sign in'}
			</button>
		</form>
		<button
			type="button"
			class="link-button"
			onclick={() => {
				registration = !registration;
			}}
		>
			{registration
				? 'Already have an account? Sign in'
				: 'New to KAGE? Create a workspace'}
		</button>
	</section>
</main>

<style>
	.auth-shell {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 100dvh;
		background: var(--background);
	}
	.auth-intro {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 60px;
		padding: 55px 65px;
		border-right: 1px solid var(--line);
		background: var(--background);
	}
	.auth-intro h1 {
		margin: 24px 0;
		font-size: clamp(34px, 4vw, 54px);
		line-height: 1.15;
		letter-spacing: -1.8px;
	}
	.auth-intro p {
		max-width: 440px;
	}
	.auth-form {
		width: 100%;
		max-width: 470px;
		margin: auto;
		padding: 60px 40px;
	}
	.auth-form h2 {
		font-size: 28px;
	}
	.auth-form form {
		margin-top: 28px;
	}
	@media (max-width: 1100px) {
		.auth-intro {
			padding: 40px;
		}
	}
	@media (max-width: 800px) {
		.auth-shell {
			display: block;
		}
		.auth-intro {
			padding: 26px;
			gap: 24px;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.auth-intro > div,
		.auth-intro > p {
			display: none;
		}
		.auth-form {
			padding: 36px 24px;
		}
	}
</style>
