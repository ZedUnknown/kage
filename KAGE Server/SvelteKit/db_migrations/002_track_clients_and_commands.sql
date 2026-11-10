SET LOCAL search_path = public;

-- Existing installations have already applied the initial migration. Keep upgrades
-- here, including when a fresh installation already has these definitions.
ALTER TABLE kage_clients
 ADD COLUMN IF NOT EXISTS security_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS presence_session text,
 ADD COLUMN IF NOT EXISTS presence_seen_at timestamptz,
 ADD COLUMN IF NOT EXISTS protocol_version integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS command_version bigint NOT NULL DEFAULT 0;

ALTER TABLE kage_commands
 ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS report jsonb NOT NULL DEFAULT '{}';

ALTER TABLE kage_commands DROP CONSTRAINT IF EXISTS kage_commands_status_check;
ALTER TABLE kage_commands ADD CONSTRAINT kage_commands_status_check
 CHECK (status IN ('queued','dispatching','published','received','executing','executed','cancelled','rejected','superseded','failed','expired','unsupported','unconfirmed'));

CREATE UNIQUE INDEX IF NOT EXISTS commands_client_version
 ON kage_commands(client_id,version) WHERE client_id IS NOT NULL AND version>0;
