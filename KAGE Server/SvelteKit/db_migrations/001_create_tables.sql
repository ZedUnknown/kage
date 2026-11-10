SET LOCAL search_path = public;

CREATE TABLE kage_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kage_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 full_name text NOT NULL,
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','member')),
 email_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);
CREATE TABLE kage_email_verifications (
 email text PRIMARY KEY,
 code_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE kage_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES kage_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON kage_sessions(expires_at);
CREATE TABLE kage_rate_limits (
 key text PRIMARY KEY,
 attempts integer NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE kage_mqtt_brokers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 name text NOT NULL,
 hostname text NOT NULL,
 port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
 tls boolean NOT NULL DEFAULT true,
 username text NOT NULL,
 password_encrypted text NOT NULL,
 ca_certificate text,
 acl_confirmed boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT true,
 connection_state text NOT NULL DEFAULT 'pending',
 last_seen timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (hostname,port)
);
CREATE TABLE kage_hubs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 broker_id uuid NOT NULL,
 hub_id text NOT NULL UNIQUE,
 name text NOT NULL,
 last_seen timestamptz,
 connection_state text NOT NULL DEFAULT 'unknown',
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,broker_id,id),
 FOREIGN KEY (tenant_id,broker_id) REFERENCES kage_mqtt_brokers(tenant_id,id)
);
CREATE TABLE kage_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 broker_id uuid NOT NULL,
 hub_id uuid NOT NULL,
 pc_id text NOT NULL,
 name text NOT NULL,
 last_seen timestamptz,
 security_state text NOT NULL DEFAULT 'unknown',
 security_updated_at timestamptz,
 connection_state text NOT NULL DEFAULT 'unknown',
 presence_session text,
 presence_seen_at timestamptz,
 protocol_version integer NOT NULL DEFAULT 0,
 capabilities jsonb NOT NULL DEFAULT '[]',
 command_version bigint NOT NULL DEFAULT 0,
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,broker_id,id),
 UNIQUE (hub_id,pc_id),
 FOREIGN KEY (tenant_id,broker_id,hub_id) REFERENCES kage_hubs(tenant_id,broker_id,id)
);
CREATE TABLE kage_device_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 broker_id uuid NOT NULL,
 hub_id uuid,
 client_id uuid,
 username text NOT NULL,
 token_encrypted text NOT NULL,
 status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','admin_confirmed','revoked')),
 connection_verified_at timestamptz,
 rotated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((hub_id IS NULL) <> (client_id IS NULL)),
 UNIQUE (hub_id), UNIQUE (client_id), UNIQUE (broker_id,username),
 FOREIGN KEY (tenant_id,broker_id) REFERENCES kage_mqtt_brokers(tenant_id,id),
 FOREIGN KEY (tenant_id,broker_id,hub_id) REFERENCES kage_hubs(tenant_id,broker_id,id),
 FOREIGN KEY (tenant_id,broker_id,client_id) REFERENCES kage_clients(tenant_id,broker_id,id)
);
CREATE TABLE kage_nodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 hub_id uuid NOT NULL,
 mac_address text NOT NULL,
 paired boolean NOT NULL DEFAULT false,
 last_seen timestamptz,
 occupancy text NOT NULL DEFAULT 'unknown' CHECK (occupancy IN ('occupied','empty','unknown')),
 diagnostics jsonb NOT NULL DEFAULT '{}',
 UNIQUE (tenant_id,id), UNIQUE (tenant_id,mac_address),
 FOREIGN KEY (tenant_id,hub_id) REFERENCES kage_hubs(tenant_id,id)
);
CREATE TABLE kage_pairing_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 hub_id uuid NOT NULL,
 mac_address text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('pair','unpair')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed','expired')),
 last_seen timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
 UNIQUE (tenant_id,id), UNIQUE (hub_id,mac_address,kind),
 FOREIGN KEY (tenant_id,hub_id) REFERENCES kage_hubs(tenant_id,id)
);
CREATE TABLE kage_node_client_mappings (
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 node_id uuid NOT NULL,
 client_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,node_id), UNIQUE (tenant_id,client_id),
 FOREIGN KEY (tenant_id,node_id) REFERENCES kage_nodes(tenant_id,id),
 FOREIGN KEY (tenant_id,client_id) REFERENCES kage_clients(tenant_id,id)
);
CREATE TABLE kage_device_states (
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 client_id uuid NOT NULL,
 dirty boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,client_id),
 FOREIGN KEY (tenant_id,client_id) REFERENCES kage_clients(tenant_id,id)
);
CREATE TABLE kage_security_policies (
 tenant_id uuid PRIMARY KEY REFERENCES kage_tenants(id),
 enabled boolean NOT NULL DEFAULT false,
 action text NOT NULL DEFAULT 'auto_lock' CHECK (action IN ('auto_lock','auto_logout')),
 delay_seconds integer NOT NULL DEFAULT 60 CHECK (delay_seconds BETWEEN 10 AND 3600),
 allow_extension boolean NOT NULL DEFAULT false
);
CREATE TABLE kage_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 broker_id uuid NOT NULL,
 client_id uuid,
 node_id uuid,
 kind text NOT NULL,
 topic text,
 payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','published','received','executing','executed','cancelled','rejected','superseded','failed','expired','unsupported','unconfirmed')),
 version bigint NOT NULL DEFAULT 0,
 report jsonb NOT NULL DEFAULT '{}',
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,broker_id) REFERENCES kage_mqtt_brokers(tenant_id,id),
 FOREIGN KEY (tenant_id,broker_id,client_id) REFERENCES kage_clients(tenant_id,broker_id,id),
 FOREIGN KEY (tenant_id,node_id) REFERENCES kage_nodes(tenant_id,id)
);
CREATE INDEX commands_pending ON kage_commands(broker_id,status,expires_at);
CREATE UNIQUE INDEX commands_client_version ON kage_commands(client_id,version) WHERE client_id IS NOT NULL AND version>0;
CREATE TABLE kage_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 broker_id uuid,
 kind text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,broker_id) REFERENCES kage_mqtt_brokers(tenant_id,id)
);
CREATE INDEX events_tenant_time ON kage_events(tenant_id,created_at DESC);
CREATE TABLE kage_audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES kage_tenants(id),
 user_id uuid NOT NULL,
 action text NOT NULL,
 resource_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,user_id) REFERENCES kage_users(tenant_id,id)
);
CREATE INDEX audit_tenant_time ON kage_audit_logs(tenant_id,created_at DESC);
