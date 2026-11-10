import { randomUUID } from 'node:crypto';
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import { InputError } from '../validation.ts';
import { probeConnectionError } from './probe-errors.ts';

export type ProbeDevice = {
	username: string;
	password: string;
	hub: string;
	pc: string | null;
};

async function connectProbe(
	options: IClientOptions,
	clients: MqttClient[],
	role: string,
	timeout = 5000
) {
	const settings: IClientOptions = {
		...options,
		clientId: `kage-probe-${randomUUID()}`,
		clean: true,
		reconnectPeriod: 0,
		connectTimeout: timeout,
		resubscribe: false,
		queueQoSZero: false
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stage = 'TCP connection';

	try {
		const client = mqtt.connect(settings);
		clients.push(client);
		client.on('error', () => {});
		client.stream.once('connect', () => {
			stage = settings.protocol === 'mqtts' ? 'TLS handshake' : 'MQTT handshake';
		});
		client.stream.once('secureConnect', () => {
			stage = 'MQTT handshake';
		});
		await new Promise<void>((resolve, reject) => {
			client.once('connect', () => resolve());
			client.once('error', reject);
			client.stream.once('error', reject);
			client.once('close', () => reject({ code: 'MQTT_CONNECTION_CLOSED' }));
			timer = setTimeout(() => reject({ code: 'MQTT_CONNECT_TIMEOUT' }), timeout);
		});

		return client;
	} catch (error) {
		throw probeConnectionError(error, settings, role, stage);
	} finally {
		clearTimeout(timer);
	}
}

// Authentication only: never publish, subscribe, or confirm device permissions.
export async function probeConnection(options: IClientOptions) {
	const clients: MqttClient[] = [];

	try {
		await connectProbe({ ...options, protocolVersion: 4 }, clients, 'Server');
	} finally {
		await Promise.all(clients.map((client) => client.endAsync(true)));
	}
}

// A real client must reply to a fresh challenge. Broker PUBACKs are not proof
// that the Windows application received or handled the message.
export async function probeClientConnection(
	options: IClientOptions,
	device: { hub: string; pc: string },
	timeout = 8000
) {
	const clients: MqttClient[] = [];
	const requestId = randomUUID();
	const base = `kage/client/${device.hub}/${device.pc}`;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onMessage: ((topic: string, body: Buffer, packet: { retain?: boolean }) => void) | undefined;

	try {
		const client = await connectProbe(options, clients, 'Server');

		return await new Promise<{ latencyMs: number }>((resolve, reject) => {
			const started = Date.now();
			timer = setTimeout(
				() =>
					reject(new InputError('Client did not reply. Check that the updated KAGE Client is running and connected to MQTT.')),
				timeout
			);
			onMessage = (topic, body, packet) => {
				if (topic !== `${base}/request` || packet.retain || body.length > 8192) return;

				try {
					const response = JSON.parse(body.toString());

					if (
						response.action === 'connection_test_reply' &&
						response.request_id === requestId &&
						response.reply_to === `${base}/response` &&
						response.data?.hub_id === device.hub &&
						response.data?.pc_id === device.pc
					) {
						resolve({ latencyMs: Date.now() - started });
					}
				} catch {
					// Other client traffic cannot satisfy this challenge.
				}
			};
			client.on('message', onMessage);
			client.once('close', () => reject(new InputError('MQTT disconnected during the client connection test.')));
			void (async () => {
				const granted = await client.subscribeAsync(`${base}/request`, { qos: 1, rh: 2 });

				if (granted.length !== 1 || granted.some((entry) => entry.qos > 2)) {
					throw new InputError('Broker denied the client reply subscription. Check server topic permissions.');
				}

				await client.publishAsync(
					`${base}/command`,
					JSON.stringify({
						type: 'connection_test',
						request_id: requestId,
						hub_id: device.hub,
						pc_id: device.pc,
						expires_at: new Date(started + timeout).toISOString()
					}),
					{ qos: 1, retain: false }
				);
			})().catch(reject);
		});
	} finally {
		clearTimeout(timer);
		for (const client of clients) {
			if (onMessage) client.removeListener('message', onMessage);

			await client.endAsync(true);
		}
	}
}

// Use device topics in their normal direction. A server-only loopback would require
// permissions the server should not have on device request topics.
export async function probeBroker(options: IClientOptions, device: ProbeDevice) {
	const clients: MqttClient[] = [];
	const deadline = Date.now() + 8000;
	const nonce = randomUUID();
	const request = device.pc
		? `kage/client/${device.hub}/${device.pc}/request`
		: `kage/hub/live/${device.hub}/status`;
	const response = device.pc
		? `kage/client/${device.hub}/${device.pc}/response`
		: `kage/hub/live/${device.hub}/pairing_response/acl-probe-${nonce}`;
	// No Hub status value, pairing acceptance or Client identity data: live
	// handlers ignore this envelope and cannot change device state.
	const payload = JSON.stringify({
		kage_acl_probe: nonce,
		request_id: `acl-probe-${nonce}`,
		reply_to: response,
		action: 'acl_probe',
		data: {}
	});

	async function wait<T>(promise: Promise<T>, message: string): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;

		try {
			return await Promise.race([
				promise,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error()), Math.max(1, deadline - Date.now()));
				})
			]);
		} catch {
			throw new InputError(message);
		} finally {
			clearTimeout(timer);
		}
	}

	async function connect(username: string, password: IClientOptions['password'], role: string) {
		return connectProbe(
			{ ...options, username, password, protocolVersion: 5 },
			clients,
			role,
			Math.max(1, Math.min(5000, deadline - Date.now()))
		);
	}

	async function deliver(sender: MqttClient, receiver: MqttClient, topic: string) {
		const granted = await wait(
			receiver.subscribeAsync(topic, { qos: 1, rh: 2 }),
			`Subscription rejected for ${topic}. Check broker read permissions.`
		);

		if (granted.length !== 1 || granted.some((entry) => entry.qos > 2)) {
			throw new InputError(`Subscription rejected for ${topic}.`);
		}

		let onMessage: (topic: string, body: Buffer, packet: { retain?: boolean }) => void;
		const received = new Promise<void>((resolve) => {
			onMessage = (actual: string, body: Buffer, packet: { retain?: boolean }) => {
				if (actual === topic && body.toString() === payload && !packet.retain) resolve();
			};
			receiver.on('message', onMessage);
		});

		try {
			await wait(
				Promise.all([sender.publishAsync(topic, payload, { qos: 1, retain: false }), received]),
				`Topic delivery failed for ${topic}. Check broker publish and read permissions.`
			);
		} finally {
			receiver.removeListener('message', onMessage!);
		}
	}

	try {
		const server = await connect(options.username!, options.password, 'Server');
		const peer = await connect(device.username, device.password, 'Device');
		await deliver(peer, server, request);
		await deliver(server, peer, response);
		if (!device.pc) {
			// Also verify the startup ping path. The probe envelope has no valid
			// ping request ID or KAGE success key, so live firmware/handlers ignore it.
			await deliver(peer, server, `kage/hub/live/${device.hub}/ping_request`);
			await deliver(server, peer, `kage/hub/live/${device.hub}/ping_response`);
		}
		// Hubs may use wildcard broker permissions. Client identities still require
		// an explicit Not Authorized PUBACK for a cross-device publish.
		if (device.pc) {
			const denied = await wait(
				peer.publishAsync(`kage/client/acl-probe-${nonce}/other/request`, payload, {
						qos: 1,
						retain: false
					})
					.then(
						() => false,
						(error: { code?: number }) => {
							if (error.code === 135) return true;

							throw error;
						}
					),
				'Cross-device publish denial could not be verified. The broker must return MQTT 5 Not Authorized.'
			);

			if (!denied) {
				throw new InputError('ACL test failed: the device can publish into another device namespace.');
			}
		}

		return { request, response, username: device.username, isolationChecked: Boolean(device.pc) };
	} finally {
		await Promise.all(clients.map((client) => client.endAsync(true)));
	}
}
