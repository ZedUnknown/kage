-- Previous confirmations were administrator assertions, not live topic tests.
-- Require one successful probe before reconnecting these brokers.
UPDATE kage_mqtt_brokers SET acl_confirmed=false,updated_at=now() WHERE acl_confirmed;
