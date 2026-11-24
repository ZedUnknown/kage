import { segment } from '../validation.ts';

export function clientTopics(username: string, hub: string, pc: string) {
	const user = segment(username),
		h = segment(hub),
		p = segment(pc);
	const base = `kage/client/${h}/${p}`;

	return {
		publish: [`kage/client/setup/by-user/${user}/request`, `${base}/request`, `${base}/presence`],
		subscribe: [`kage/client/setup/by-user/${user}/response/+`, `${base}/response`, `${base}/state`, `${base}/command`]
	};
}

export function clientAcl(username: string, hub: string, pc: string) {
	const { publish, subscribe } = clientTopics(username, hub, pc);
	return [
		`user ${username}`,
		`topic write ${publish[0]}`,
		`topic read ${subscribe[0]}`,
		...publish.slice(1).map((topic) => `topic write ${topic}`),
		...subscribe.slice(1).map((topic) => `topic read ${topic}`),
		''
	].join('\n');
}
