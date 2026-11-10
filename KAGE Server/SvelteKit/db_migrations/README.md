
From `KAGE Server/SvelteKit`, install dependencies and configure the PostgreSQL connection in `.env` (`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`). Then run:

```sh
npm run db:migrate
```

Run this before starting the web server or MQTT worker after an update. The command applies numbered `.sql` files in order, records them in `public.kage_schema_migrations`, and skips migrations already applied. If a migration fails, the transaction rolls back.
