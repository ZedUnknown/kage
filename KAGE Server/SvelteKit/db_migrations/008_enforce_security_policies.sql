ALTER TABLE kage_nodes ADD COLUMN occupancy_since timestamptz;
ALTER TABLE kage_clients
 ADD COLUMN policy_runtime jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN activity_tick bigint,
 ADD COLUMN last_input_at timestamptz,
 ADD COLUMN activity_seen_at timestamptz;
