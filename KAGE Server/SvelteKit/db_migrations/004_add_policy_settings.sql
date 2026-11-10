ALTER TABLE kage_security_policies
 ADD COLUMN extension_duration_seconds integer NOT NULL DEFAULT 300 CHECK (extension_duration_seconds BETWEEN 10 AND 3600),
 ADD COLUMN maximum_extensions integer NOT NULL DEFAULT 1 CHECK (maximum_extensions BETWEEN 1 AND 100),
 ADD COLUMN client_disconnect_timeout_seconds integer NOT NULL DEFAULT 60 CHECK (client_disconnect_timeout_seconds BETWEEN 10 AND 86400),
 ADD COLUMN offline_action text NOT NULL DEFAULT 'lock' CHECK (offline_action IN ('none','lock','logout')),
 ADD COLUMN allow_recovery_code boolean NOT NULL DEFAULT false,
 ADD COLUMN inactivity_monitoring_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN inactivity_timeout_seconds integer NOT NULL DEFAULT 300 CHECK (inactivity_timeout_seconds BETWEEN 10 AND 86400),
 ADD COLUMN confirmation_timeout_seconds integer NOT NULL DEFAULT 30 CHECK (confirmation_timeout_seconds BETWEEN 10 AND 3600);
