ALTER TABLE kage_device_credentials ADD COLUMN provisioning_password_encrypted text;

CREATE TABLE kage_device_setup_downloads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id uuid NOT NULL UNIQUE REFERENCES kage_device_credentials(id) ON DELETE CASCADE,
    username text NOT NULL,
    password_digest text NOT NULL,
    credential_rotated_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);
