import { config } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

const app = createApp({ config });
await app.listen();

console.log(`Greenwich Credit Partners: http://localhost:${config.port}/`);
console.log(`Admin login:             http://localhost:${config.port}/admin/login.html`);
console.log(`SQLite database:         ${config.dbPath} (schema v${app.db.schemaVersion()})`);
console.log(`Partner demo form:       http://localhost:${config.port}/partners.html`);
console.log(`Demo collection:         ${config.demoMode ? 'enabled (fictional data only)' : 'disabled'}`);
if (config.generatedAdminPassword) {
  console.log(`Local admin username:    ${config.adminUsername}`);
  console.log(`Local admin password:    ${config.adminPassword}`);
  console.log('Set ADMIN_PASSWORD in .env before sharing this server.');
}
if (config.generatedSessionSecret) console.log('A temporary local SESSION_SECRET was generated for this run.');

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: closing HTTP server and database.`);
  try {
    await app.close();
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown failed:', error.message);
    process.exit(1);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
