/* Creates an admin account, or resets its password:  npm run admin:create
   The password is typed hidden. For scripts, set ADMIN_USERNAME and ADMIN_PASSWORD instead. */
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { MIN_PASSWORD, upsertAdmin } from './auth.js';

function prompter() {
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return {
    ask: (question, { secret = false } = {}) =>
      new Promise((resolve) => {
        rl.question(question, (answer) => {
          if (secret) process.stdout.write('\n');
          hidden = false;
          resolve(answer);
        });
        hidden = secret;
      }),
    close: () => rl.close(),
  };
}

let { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
if (!username || !password) {
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal, or set ADMIN_USERNAME and ADMIN_PASSWORD.');
    process.exit(1);
  }
  const p = prompter();
  username = await p.ask('Admin username: ');
  password = await p.ask(`Password (at least ${MIN_PASSWORD} characters): `, { secret: true });
  const again = await p.ask('Type the password again: ', { secret: true });
  p.close();
  if (password !== again) {
    console.error('The two passwords do not match.');
    process.exit(1);
  }
}

const db = createDb(loadEnv().databaseUrl);
try {
  const admin = await upsertAdmin(db, username, password);
  console.log(admin.created ? `Created admin “${admin.username}”.` : `Updated the password for “${admin.username}”.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
