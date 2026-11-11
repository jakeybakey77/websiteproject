import { config } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

const app = createApp({ config });
await app.listen();

console.log(`Greenwich Credit Partners: http://localhost:${config.port}/`);
console.log(`Admin login:             http://localhost:${config.port}/admin/login.html`);
console.log(`SQLite database:         ${config.dbPath}`);
console.log(`Demo collection:         ${config.demoMode ? 'enabled (fictional data only)' : 'disabled'}`);
if (config.generatedAdminPassword) {
  console.log(`Local admin username:    ${config.adminUsername}`);
  console.log(`Local admin password:    ${config.adminPassword}`);
  console.log('Set ADMIN_PASSWORD in .env before sharing this server.');
}
if (config.generatedSessionSecret) console.log('A temporary local SESSION_SECRET was generated for this run.');

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
