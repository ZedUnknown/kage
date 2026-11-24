ALTER TABLE kage_hubs
    ADD COLUMN paired_node_macs text[],
    ADD COLUMN paired_nodes_seen_at timestamptz;
