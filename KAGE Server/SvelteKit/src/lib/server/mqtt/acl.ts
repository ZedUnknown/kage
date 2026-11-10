import { segment } from '../validation.ts';

export function clientAcl(username: string, hub: string, pc: string) {
	const user = segment(username),
		h = segment(hub),
		p = segment(pc);
	const base = `kage/client/${h}/${p}`;

	return [
		`user ${user}`,
		`topic write kage/client/setup/by-user/${user}/request`,
		`topic read kage/client/setup/by-user/${user}/response/+`,
		`topic write ${base}/request`,
		`topic write ${base}/presence`,
		`topic read ${base}/response`,
		`topic read ${base}/state`,
		`topic read ${base}/command`,
		''
	].join('\n');
}
