export type ConnectionFilter = 'all' | 'online' | 'offline';

export function connectionStatus(state: string) {
	if (state === 'online' || state === 'connected') return 'online';
	if (state === 'offline' || state === 'disconnected') return 'offline';

	return 'unknown';
}
