import { clientAcl } from '../src/lib/server/mqtt/acl.ts';

const [username, hub, pc] = process.argv.slice(2);

if (!username || !hub || !pc) {
	throw new Error('Usage: node scripts/client-acl.ts USERNAME HUB-ID PC-ID');
}

console.log(clientAcl(username, hub, pc));
