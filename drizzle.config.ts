import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema and bundled with the app; at runtime
// the main process applies them against userData/app.db.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
});
