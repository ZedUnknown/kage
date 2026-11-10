# KAGE PC client MQTT contract (v1)

The PC connects only to the MQTT broker. The admin/backend service subscribes to
requests and publishes replies, state and commands through that broker. The client
has no HTTP or SSE transport and does not need an admin-server address.

**Backend implementation is pending.** The topics below define the contract for
the admin server under construction. A broker connection alone enables the first
setup step; hub/PC lookup, registration, state refresh and extension cancellation
require the corresponding backend handlers.

## Connection and authentication

- Setup accepts `mqtts://host:8883` (TLS) or `mqtt://host:1883`. Omitted ports default
  to 8883 and 1883 respectively. HTTP URLs, URL credentials, paths and queries are rejected.
- The masked **MQTT token** field is required and is sent as the MQTT CONNECT
  password. The optional username field is sent as the MQTT CONNECT username.
  A broker configured with a Mosquitto password file needs a matching username.
  Token-only authentication requires the broker's authentication plugin to accept
  an empty username and validate the password token.
- Credentials are reused for runtime connections and reconnects. The token is
  stored in the existing `Mqtt.Password` configuration field and is never put in
  a topic, address, request body, or diagnostic message by the client.
- Setup and runtime both validate TLS using the embedded `Certificates/ca.crt`.
  Hostname and certificate validity checks remain enabled. For an IP address,
  issue the broker certificate with that IP in its subject alternative names.
- Existing version 2 configurations with valid `Mqtt`, `HubId` and `PcId` fields
  continue working. The old `ServerAddress` field is ignored.
- MQTT connections use unique client IDs and clean sessions. Runtime reconnects
  after three seconds, resubscribes, and requests current state again.

## Request/reply envelope

Requests use QoS 1, retain=false. The client subscribes to its reply topic and waits
for SUBACK before sending any requests. Every request has a new random ID:

```json
{
  "request_id": "9dbd7f1d21714c9ca684c28641856ed4c",
  "reply_to": "kage/client/setup/kage-pc-<connection-id>/response",
  "action": "hub_check",
  "data": { "hub_id": "HUB-01" }
}
```

Publish the reply to `reply_to`, with QoS 1 and retain=false, echoing `request_id`:

```json
{
  "request_id": "9dbd7f1d21714c9ca684c28641856ed4c",
  "data": { "available": true, "available_pcs": ["PC-01", "PC-02"] },
  "detail": { "code": "SUCCESS", "message": "Hub verified." }
}
```

Failures use a non-`SUCCESS` code (for example `INVALID_HUB_ID`, `PC_UNAVAILABLE`,
`NOT_AUTHORIZED` or `PRESENCE_REQUIRED`) and a user-readable `detail.message`.
Use an object for `data`, including `{}` on errors. JSON property names are case
sensitive. Requests time out after ten seconds, and disconnects fail pending
requests. Retained, uncorrelated and late replies are ignored. A broker PUBACK
means delivery to the broker, not application approval.

Backend handlers must authorize requests using the broker identity and assigned
Hub/PC, restrict reply destinations to that client's allowed topic, and handle
QoS 1 duplicates idempotently. Registration should also be idempotent across a
manual retry with a new request ID after a lost reply. Check availability and
claim the PC atomically at registration; an earlier availability check is advisory.
Do not embed the token in replies.

## Setup

Request topic: `kage/client/setup/request`.

Reply topic: `kage/client/setup/{mqtt-client-id}/response`, where the MQTT client ID
is `kage-pc-` followed by a random GUID without hyphens. It is stable for one setup
connection. Use the envelope's `reply_to` value.

| Action | Request `data` | Successful reply `data` |
| --- | --- | --- |
| `hub_check` | `{ "hub_id": "HUB-01" }` | `{ "available": true, "available_pcs": ["PC-01"] }` |
| `pc_check` | `{ "hub_id": "HUB-01", "pc_id": "PC-01" }` | `{ "available": true }` |
| `register` | `{ "hub_id": "HUB-01", "pc_id": "PC-01" }` | `{ "registered": true }` |

Hub and PC IDs must be nonempty MQTT topic segments without `/`, `+`, `#`, or NUL.
The client persists the broker and credentials entered in setup after confirmed
registration. The reply does not supply another host or an admin-server URL.

## Runtime requests

Request topic: `kage/client/{hub_id}/{pc_id}/request`.
Reply topic: `kage/client/{hub_id}/{pc_id}/response`.

| Action | Request `data` | Successful reply `data` |
| --- | --- | --- |
| `state` | `{ "hub_id": "HUB-01", "pc_id": "PC-01" }` | Current state object described below |
| `cancel_extension` | `{ "hub_id": "HUB-01", "pc_id": "PC-01", "command": "auto_lock", "deadline_utc": "2026-11-08T16:00:00Z", "duration_seconds": 0 }` | Approved cancellation command described below |

On startup, reconnect and manual refresh the client requests `state`. Before
cancellation it also requests fresh state, verifies assigned-chair presence,
then sends `cancel_extension`. The backend must recheck presence and the active
command/deadline when processing cancellation; reject stale requests and forced
actions. Local countdowns continue during requests, rejection and disconnects.

## Live state and commands

Publish the raw state object (without a response envelope) to
`kage/client/{hub_id}/{pc_id}/state`. It may be retained for initial display:

```json
{
  "hub": { "hub_id": "HUB-01", "online": true, "last_seen": "2026-11-08T15:55:00Z" },
  "pc": { "pc_id": "PC-01" },
  "assignment": { "assigned": true, "chair_id": "CHAIR-01" },
  "chair": { "chair_id": "CHAIR-01", "online": true, "occupied": true },
  "sensor": { "online": true, "state": "active" }
}
```

`hub`, `pc` and `assignment` are required; Hub and PC IDs must match the subscribed
client. `chair` and `sensor` can be null. A `state` request must produce a fresh
correlated reply, even if the same state is already retained on the live topic.

Publish raw command objects to `kage/client/{hub_id}/{pc_id}/command` with QoS 1,
retain=false:

```json
{
  "command": "auto_lock",
  "priority": 1,
  "deadline_utc": "2026-11-08T16:00:00Z",
  "server_time_utc": "2026-11-08T15:55:00Z",
  "message": "Please return to your chair.",
  "extension_active": false,
  "allow_extension": true,
  "allow_cancellation": true
}
```

Supported actions are `auto_lock`, `auto_logout`, `force_lock`, `force_logout`
and their `cancel_` forms. An approved `cancel_extension` response must contain
`cancel_auto_lock` or `cancel_auto_logout` matching the original command, with
priority at least that of the active command. The client applies this approved
reply only if its pending request and current chair presence are still valid.

Existing extension requests keep their topic and payload:

Topic: `kage/client/{hub_id}/{pc_id}/extension/request`, QoS 1, retain=false.

```json
{ "command": "auto_lock", "requested_seconds": 300 }
```

Allowed durations are 60, 120, 300 and 600 seconds. Approve an extension by
publishing an updated authoritative command with a new deadline and
`extension_active: true`. Publishing the request alone never changes the timer.

## Broker permissions

Allow each setup identity to publish `kage/client/setup/request` and subscribe
only to its own setup reply topic. Mosquitto ACL patterns can use `%c` for the
client ID. Registered identities need subscribe access to their `/state`,
`/command`, `/response` topics and publish access to their `/request` and
`/extension/request` topics. The backend needs the inverse permissions.
Bind runtime Hub/PC permissions to the authenticated token or username; do not
grant every PC access to every other PC's topics.
