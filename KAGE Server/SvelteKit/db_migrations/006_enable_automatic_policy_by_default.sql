ALTER TABLE kage_security_policies
 ALTER COLUMN enabled SET DEFAULT true;

-- Earlier versions forced this preference off rather than allowing users to choose it.
UPDATE kage_security_policies SET enabled=true WHERE enabled=false;
