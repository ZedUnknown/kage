<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { provideWorkspace } from '#lib/client/workspace.svelte.ts';
	import type { LayoutProps } from './$types';
	import KageBrand from '#lib/client/components/common/KageBrand.svelte';
	import Home from '#lib/client/components/icons/Home.svelte';
	import HardDrives from '#lib/client/components/icons/HardDrives.svelte';
	import TreeView from '#lib/client/components/icons/TreeView.svelte';
	import Devices from '#lib/client/components/icons/Devices.svelte';
	import Handshake from '#lib/client/components/icons/Handshake.svelte';
	import ListChecks from '#lib/client/components/icons/ListChecks.svelte';
	import Target from '#lib/client/components/icons/Target.svelte';
	import ShieldCheck from '#lib/client/components/icons/ShieldCheck.svelte';
	import ClockCounterClockwise from '#lib/client/components/icons/ClockCounterClockwise.svelte';
	import UserCircle from '#lib/client/components/icons/UserCircle.svelte';
	import ClassicSidebar from '#lib/client/components/icons/ClassicSidebar.svelte';
	import XCircle from '#lib/client/components/icons/XCircle.svelte';
	import PullToRefresh from '#lib/client/components/common/PullToRefresh.svelte';

	let { data, children }: LayoutProps = $props();

	const workspace = provideWorkspace(untrack(() => data));
	let sidebarCollapsed = $state(false);
	const tabs = [
		{ label: 'Dashboard', href: '/(app)', icon: Home },
		{ label: 'Brokers', href: '/(app)/brokers', icon: HardDrives },
		{ label: 'Hubs', href: '/(app)/hubs', icon: TreeView },
		{ label: 'Clients', href: '/(app)/clients', icon: Devices },
		{ label: 'Pairing', href: '/(app)/pairing', icon: Handshake },
		{ label: 'Mappings', href: '/(app)/mappings', icon: ListChecks },
		{ label: 'Commands', href: '/(app)/commands', icon: Target },
		{ label: 'Policies', href: '/(app)/policies', icon: ShieldCheck },
		{ label: 'History', href: '/(app)/history', icon: ClockCounterClockwise },
		{ label: 'Account', href: '/(app)/account', icon: UserCircle }
	] as const;

	$effect(() => {
		workspace.update(data);
	});
	afterNavigate(() => {
		workspace.mobileOpen = false;
	});

	onMount(() => {
		try {
			sidebarCollapsed = localStorage.getItem('kage.sidebarCollapsed') === 'true';
		} catch {
			/* Storage is optional. */
		}

		const media = window.matchMedia('(max-width: 800px)');

		const updateViewport = () => {
			workspace.isMobile = media.matches;
			if (!workspace.isMobile) workspace.mobileOpen = false;
		};

		updateViewport();
		media.addEventListener('change', updateViewport);
		const timer = setInterval(() => {
			if (!document.hidden && !workspace.busy) void workspace.refresh();
		}, 10000);

		return () => {
			clearInterval(timer);
			workspace.dismissConnectionToast();
			media.removeEventListener('change', updateViewport);
		};
	});

	$effect(() => {
		if (workspace.mobileOpen && workspace.isMobile) {
			const previousOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';

			return () => {
				document.body.style.overflow = previousOverflow;
			};
		}
	});

	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;

		try {
			localStorage.setItem('kage.sidebarCollapsed', String(sidebarCollapsed));
		} catch {
			/* Session preference still works. */
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && workspace.mobileOpen) void workspace.closeMobileMenu();
	}}
/>
<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
	{#if workspace.mobileOpen}<button
			type="button"
			class="nav-backdrop"
			aria-label="Close navigation"
			tabindex="-1"
			onclick={workspace.closeMobileMenu}
	>
		</button>{/if}
	<aside
		id="workspace-sidebar"
		class="sidebar"
		class:mobile-open={workspace.mobileOpen}
		inert={workspace.isMobile && !workspace.mobileOpen}
	>
		<div class="sidebar-top">
			<KageBrand compact={sidebarCollapsed && !workspace.mobileOpen} />
			<button
				bind:this={workspace.closeMenuButton}
				type="button"
				class="icon-button mobile-only"
				aria-label="Close navigation"
				onclick={workspace.closeMobileMenu}
			>
				<XCircle properties="size-5" />
			</button>
		</div>
		<div class="sidebar-divider" aria-hidden="true"></div>
		<nav id="workspace-navigation" aria-label="Workspace">
			{#each tabs as item (item.href)}<a
					href={resolve(item.href)}
					class:active={page.route.id === item.href ||
						(item.href !== '/(app)' && page.route.id?.startsWith(`${item.href}/`))}
					aria-label={item.label}
					aria-current={page.route.id === item.href
						? 'page'
						: item.href !== '/(app)' && page.route.id?.startsWith(`${item.href}/`)
							? 'location'
							: undefined}
					title={sidebarCollapsed ? item.label : undefined}
					onclick={() => (workspace.mobileOpen = false)}
			>
				<span class="nav-icon" aria-hidden="true"><item.icon properties="size-5" /></span><span
						class="nav-text"
				>
						{item.label}
				</span>
			</a>{/each}
		</nav>
		<div class="sidebar-collapse desktop-only">
			<button
				type="button"
				class="icon-button sidebar-toggle"
				title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				aria-expanded={!sidebarCollapsed}
				aria-controls="workspace-navigation"
				onclick={toggleSidebar}
			>
				<ClassicSidebar properties="size-5" collapsed={sidebarCollapsed} />
			</button>
		</div>
	</aside>
	<main class="workspace" inert={workspace.isMobile && workspace.mobileOpen}>
		<PullToRefresh
			onRefresh={workspace.refresh}
			disabled={!workspace.isMobile || workspace.mobileOpen || workspace.busy}
		>
			{@render children()}
		</PullToRefresh>
	</main>
</div>

<style>
	.app-shell {
		--sidebar-width: 244px;
		--workspace-header-height: 95px;
		display: grid;
		grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
		min-height: 100dvh;
		background: var(--background);
		transition: grid-template-columns var(--sidebar-duration) var(--sidebar-easing);
	}
	.sidebar {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding: 0 12px 16px;
		border-right: 1px solid var(--line);
		background: var(--background);
		overflow: hidden;
	}
	.sidebar-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: calc(var(--workspace-header-height) - 1px);
		flex-shrink: 0;
		margin: 0 8px;
	}
	.sidebar-divider {
		flex-shrink: 0;
		margin-inline: -12px;
		margin-bottom: 12px;
		border-top: 1px solid var(--line);
	}
	.sidebar nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 0;
		overflow: auto;
		padding: 2px;
	}
	.sidebar nav a {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		gap: 12px;
		min-height: 42px;
		height: 44px;
		flex-shrink: 0;
		padding: 10px;
		overflow: hidden;
		border: 1px solid transparent;
		border-bottom-width: 2px;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
		font-size: 13px;
		line-height: 1.4;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease;
	}
	.sidebar nav a:hover {
		background: var(--surface);
		color: var(--text);
		border-color: var(--line);
	}
	.sidebar nav a.active {
		color: #fff;
		background: var(--action);
		border-color: var(--accent-border);
	}
	.sidebar nav a.active:hover {
		background: var(--action);
	}
	.nav-icon {
		display: inline-flex;
		width: 24px;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
	}
	/* Scope through the navigation wrapper to reach SVGs inside child components. */
	.nav-icon :global(svg) {
		display: block;
	}
	.nav-text {
		max-width: 160px;
		opacity: 1;
		overflow: hidden;
		white-space: nowrap;
		transition:
			max-width var(--sidebar-duration) var(--sidebar-easing),
			opacity 150ms ease;
	}
	.sidebar-collapse {
		position: relative;
		height: 49px;
		flex-shrink: 0;
		margin-top: auto;
		border-top: 1px solid var(--line);
	}
	.sidebar-collapse .sidebar-toggle {
		position: absolute;
		top: 12px;
		left: 100%;
		transform: translateX(-100%);
		transition:
			left var(--sidebar-duration) var(--sidebar-easing),
			transform var(--sidebar-duration) var(--sidebar-easing),
			background-color 180ms ease,
			color 180ms ease;
	}
	.workspace {
		--workspace-padding-inline: 40px;
		--workspace-padding-bottom: 48px;
		width: 100%;
		min-width: 0;
		min-height: 100dvh;
		margin: 0 auto;
		padding: 0 var(--workspace-padding-inline) var(--workspace-padding-bottom);
	}
	.nav-backdrop {
		display: none !important;
	}
	@media (min-width: 801px) {
		.app-shell.sidebar-collapsed {
			--sidebar-width: 76px;
		}
		.sidebar-collapsed .nav-text {
			max-width: 0;
			opacity: 0;
		}
		.sidebar-collapsed .sidebar-collapse .sidebar-toggle {
			left: 50%;
			transform: translateX(-50%);
		}
	}
	@media (max-width: 1100px) {
		.workspace {
			--workspace-padding-inline: 24px;
			--workspace-padding-bottom: 40px;
		}
	}
	@media (max-width: 800px) {
		.app-shell {
			display: block;
		}
		.sidebar {
			position: fixed;
			z-index: 40;
			top: 0;
			bottom: 0;
			left: 0;
			width: min(280px, calc(100vw - 48px));
			height: 100dvh;
			transform: translateX(-100%);
			visibility: hidden;
			transition:
				transform 220ms ease,
				visibility 220ms ease;
		}
		.sidebar.mobile-open {
			transform: translateX(0);
			visibility: visible;
			box-shadow: 16px 0 40px #0005;
		}
		button.nav-backdrop {
			position: fixed;
			z-index: 30;
			inset: 0;
			display: block !important;
			width: 100%;
			height: 100%;
			padding: 0;
			border: 0;
			border-radius: 0;
			background: #0008;
		}
		button.nav-backdrop:hover {
			background: #0008;
		}
		.workspace {
			--workspace-padding-inline: 18px;
			--workspace-padding-bottom: 36px;
		}
	}
</style>
