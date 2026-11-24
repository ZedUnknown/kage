CREATE TABLE kage_provisioning_portals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id uuid NOT NULL REFERENCES kage_hubs(id) ON DELETE CASCADE,
    username text NOT NULL,
    password_digest text NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX provisioning_portals_by_hub ON kage_provisioning_portals(hub_id, expires_at);

CREATE TABLE kage_provisioning_portal_files (
    portal_id uuid NOT NULL REFERENCES kage_provisioning_portals(id) ON DELETE CASCADE,
    credential_id uuid NOT NULL REFERENCES kage_device_credentials(id) ON DELETE CASCADE,
    credential_rotated_at timestamptz NOT NULL,
    PRIMARY KEY (portal_id, credential_id)
);

CREATE INDEX provisioning_portal_files_by_credential
    ON kage_provisioning_portal_files(credential_id);
