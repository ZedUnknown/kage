import { getContext, setContext, tick } from 'svelte';
import { invalidate } from '$app/navigation';
import { page } from '$app/state';
import { toast } from 'svelte-sonner';
import type { LayoutData } from '../../routes/(app)/$types';

type WorkspaceData = Pick<LayoutData, 'account' | 'dashboard'>;

const workspaceKey = Symbol('workspace');

export class Workspace {
	overview: WorkspaceData['dashboard'] = $state({});
	account = $state<WorkspaceData['account']>()!;
	busy = $state(false);
	disconnected = $state(false);
	refreshing = $state(false);
	deliveries = $state<Record<string, { username: string; token: string } | undefined>>({});
	mobileOpen = $state(false);
	isMobile = $state(false);
	closeMenuButton = $state<HTMLButtonElement>();
	private menuTrigger?: HTMLButtonElement;
	private pendingRefresh?: Promise<void>;
	private serverDashboard?: WorkspaceData['dashboard'];
	private connectionToast?: string | number;

	constructor(data: WorkspaceData) {
		this.update(data);
	}

	update(data: WorkspaceData) {
		if (this.serverDashboard !== data.dashboard) {
			this.serverDashboard = data.dashboard;
			this.overview = data.dashboard;
		}

		this.account = data.account;
	}

	refresh = () => {
		if (this.pendingRefresh) return this.pendingRefresh;

		this.refreshing = true;
		this.pendingRefresh = this.fetchDashboard().finally(() => {
			this.refreshing = false;
			this.pendingRefresh = undefined;
		});

		return this.pendingRefresh;
	};

	private async fetchDashboard() {
		try {
			const response = await fetch('/api/admin/dashboard');

			if (response.status === 401) {
				window.location.assign('/auth');

				return;
			}

			if (!response.ok) throw new Error('Unavailable');

			this.overview = await response.json();
			this.dismissConnectionToast();
			this.disconnected = false;
		} catch {
			if (!this.disconnected) {
				this.connectionToast = toast.warning('Connection interrupted', {
					description: 'Data may be out of date. Retrying automatically.',
					duration: Number.POSITIVE_INFINITY
				});
			}

			this.disconnected = true;
		}
	}

	dismissConnectionToast() {
		if (this.connectionToast !== undefined) {
			toast.dismiss(this.connectionToast);
			this.connectionToast = undefined;
		}
	}

	openMobileMenu = async (event: MouseEvent) => {
		this.menuTrigger = event.currentTarget as HTMLButtonElement;
		this.mobileOpen = true;
		await tick();
		this.closeMenuButton?.focus();
	};

	closeMobileMenu = async () => {
		this.mobileOpen = false;
		await tick();
		this.menuTrigger?.focus();
	};
}

export function provideWorkspace(data: WorkspaceData) {
	return setContext(workspaceKey, new Workspace(data));
}

export function getWorkspace(): Workspace {
	return getContext(workspaceKey);
}

export function createPageActions(workspace = getWorkspace()) {
	async function action(resource: string, body: object, errorToasterId?: string) {
		if (workspace.busy) return false;

		const deliveryPath = page.url.pathname;
		workspace.busy = true;

		try {
			const response = await fetch(`/api/admin/${resource}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json();

			if (!response.ok) throw new Error(result.error || 'Request failed');

			if (result.token) {
				workspace.deliveries[deliveryPath] = { username: result.username, token: result.token };
			}

			toast.success(result.message || 'Saved.');
			// Finish any earlier snapshot before fetching the saved state.
			if (workspace.refreshing) await workspace.refresh();

			await workspace.refresh();
			if (resource === 'account') await invalidate('app:workspace');

			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Connection unavailable', {
				toasterId: errorToasterId,
				...(resource === 'brokers' &&
				['test_connection', 'test_acl', 'confirm_acl'].includes(
					String((body as { action?: unknown }).action)
				)
					? { duration: 15000 }
					: {})
			});

			return false;
		} finally {
			workspace.busy = false;
		}
	}

	function submit(event: SubmitEvent, resource: string, extra: object = {}) {
		event.preventDefault();
		const fields = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
		void action(resource, { ...fields, ...extra });
	}

	async function logout() {
		try {
			const response = await fetch('/api/auth/logout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});

			if (response.ok) window.location.assign('/auth');
			else {
				toast.error('Sign out failed. Try again.');
			}
		} catch {
			toast.error('Connection unavailable. Try signing out again.');
		}
	}

	return {
		get busy() {
			return workspace.busy;
		},
		action,
		submit,
		logout
	};
}

export type PageActions = ReturnType<typeof createPageActions>;
