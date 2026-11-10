SET LOCAL search_path = public;

-- A Hub radio dispatch is terminal, but does not prove LED execution on the Node.
ALTER TABLE kage_commands DROP CONSTRAINT IF EXISTS kage_commands_status_check;
ALTER TABLE kage_commands ADD CONSTRAINT kage_commands_status_check
 CHECK (status IN ('queued','dispatching','published','received','executing','executed','cancelled','rejected','superseded','failed','expired','unsupported','unconfirmed','dispatched'));
