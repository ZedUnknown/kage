import type { IClientOptions } from 'mqtt';
import { InputError } from '../validation.ts';

const mqttReasons: Record<number, string> = {
	1: 'Unsupported protocol version. Check the MQTT versions enabled on this listener.',
	2: 'Client identifier rejected. Check the broker client ID policy.',
	3: 'Broker unavailable. Check broker health and connection limits.',
	4: 'Bad username or password. Check the saved credentials.',
	5: 'Not authorized. Check the saved credentials and broker connection policy.',
	128: 'Unspecified broker error. Check the broker logs.',
	129: 'Malformed MQTT packet. Check broker protocol compatibility.',
	130: 'MQTT protocol error. Check broker protocol compatibility.',
	131: 'Broker implementation error. Check the broker logs.',
	132: 'Unsupported protocol version. Check the MQTT versions enabled on this listener.',
	133: 'Client identifier rejected. Check the broker client ID policy.',
	134: 'Bad username or password. Check the saved credentials.',
	135: 'Not authorized. Check the saved credentials and broker connection policy.',
	136: 'Broker unavailable. Check broker health and connection limits.',
	137: 'Broker busy. Check broker load and connection limits.',
	138: 'Connection banned by the broker. Check broker access restrictions.',
	140: 'Authentication method rejected. Check the broker authentication configuration.',
	149: 'MQTT packet too large. Check the broker packet size limit.',
	151: 'Broker quota exceeded. Check the broker connection quota.',
	156: 'Broker requires a different server. Check the configured endpoint.',
	157: 'Broker has moved. Update the configured endpoint.',
	159: 'Broker connection rate limit exceeded. Wait before retrying.'
};

const transportReasons: Record<string, string> = {
	ENOTFOUND: 'DNS could not find the broker hostname. Check the saved hostname.',
	EAI_AGAIN: 'DNS lookup temporarily failed. Check the server DNS/network and retry.',
	ECONNREFUSED: 'TCP connection refused. Check the port and that the broker listener is running.',
	EHOSTUNREACH: 'Broker host is unreachable from the KAGE server. Check routing and firewall rules.',
	ENETUNREACH: 'Broker network is unreachable from the KAGE server. Check routing and network access.',
	ECONNRESET: 'The remote endpoint reset the connection. Check listener TLS settings and broker logs.',
	EPIPE: 'The remote endpoint closed the socket while KAGE was sending. Check broker logs.',
	CERT_HAS_EXPIRED: 'TLS certificate expired. Renew the expired certificate in the broker certificate chain.',
	CERT_NOT_YET_VALID: 'TLS certificate is not valid yet. Check certificate dates and the server clock.',
	DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS certificate is self-signed and untrusted. Configure the correct CA certificate.',
	SELF_SIGNED_CERT_IN_CHAIN: 'TLS certificate chain contains an untrusted self-signed certificate. Check the configured CA.',
	UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate chain could not be verified. Check the broker intermediate certificates and configured CA.',
	UNABLE_TO_GET_ISSUER_CERT: 'TLS issuer certificate is missing. Check the broker certificate chain and configured CA.',
	UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'TLS issuer is not trusted. Check the broker certificate chain and configured CA.',
	ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate does not match the broker hostname. Use a hostname listed in the certificate.',
	ERR_SSL_WRONG_VERSION_NUMBER: 'TLS handshake received an incompatible response. Check that this port is a TLS MQTT listener.',
	ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION: 'TLS protocol version rejected. Check the listener TLS versions.',
	ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE: 'TLS handshake rejected. Check TLS compatibility and whether the broker requires a client certificate.',
	ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED: 'Broker requires a TLS client certificate. This connection supplies server username/password only.',
	ERR_OSSL_PEM_NO_START_LINE: 'Invalid PEM certificate. Check the saved CA certificate format.'
};

// Never echo raw error messages: TLS and broker errors can contain arbitrary text.
export function probeConnectionError(
	error: unknown,
	options: IClientOptions,
	role: string,
	stage: string
) {
	const failure = error as { code?: unknown; message?: unknown } | null;
	const code = failure?.code;
	const version = options.protocolVersion === 5 ? '5' : '3.1.1';
	let reason: string;

	if (typeof code === 'number' && Number.isInteger(code) && code > 0 && code <= 255) {
		reason = `Broker rejected the connection (MQTT ${version} CONNACK ${code}): ${mqttReasons[code] || 'Check the broker logs for this reason code.'}`;
	} else if (typeof code === 'string' && Object.hasOwn(transportReasons, code)) {
		reason = `${transportReasons[code]} [${code}]`;
	} else if (
		code === 'ETIMEDOUT' ||
		code === 'MQTT_CONNECT_TIMEOUT' ||
		failure?.message === 'connack timeout'
	) {
		reason = `Timed out during ${stage}${code === 'MQTT_CONNECT_TIMEOUT' || failure?.message === 'connack timeout' ? ` after ${options.connectTimeout ?? 5000} ms` : ''}. No connection acknowledgement was received. Check the listener, firewall and broker logs. [${code === 'ETIMEDOUT' ? code : 'MQTT_CONNECT_TIMEOUT'}]`;
	} else if (code === 'MQTT_CONNECTION_CLOSED') {
		reason = `Connection closed during ${stage} before an MQTT acknowledgement; no rejection reason was supplied. Check listener TLS settings, MQTT version and broker logs. [MQTT_CONNECTION_CLOSED]`;
	} else if (typeof code === 'string' && /^ERR_(SSL|TLS|OSSL)_[A-Z0-9_]{1,64}$/.test(code)) {
		reason = `TLS setup or handshake failed. Check certificate configuration and TLS compatibility. [${code}]`;
	} else {
		reason = `Failed during ${stage}; no recognized error code was supplied. Check the broker logs.`;
	}

	const tls = options.protocol === 'mqtts';
	const host = options.servername || options.hostname || options.host || 'unknown host';
	const port = options.port || (tls ? 8883 : 1883);

	return new InputError(
		`${role} MQTT connection failed. ${reason} Target: ${host}:${port}; TLS ${tls ? 'on' : 'off'}; MQTT ${version}.`
	);
}
