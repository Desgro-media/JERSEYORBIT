/* Creates an admin account, or resets its password:  npm run admin:create
   Removes one:                                       npm run admin:remove -- <username>
   The password is typed hidden. For scripts, set ADMIN_USERNAME, ADMIN_PASSWORD and optionally ADMIN_ROLE. */
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { MIN_PASSWORD, removeAdmin, upsertAdmin } from './auth.js';

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

/** run one account change with the owner database connection, and report how it went */
async function withDb(work) {
  const db = createDb(loadEnv().ownerUrl);
  try {
    console.log(await work(db));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

async function remove(username) {
  if (!username) {
    console.error('Say which account: npm run admin:remove -- <username>');
    process.exitCode = 1;
    return;
  }
  await withDb(async (db) => {
    const gone = await removeAdmin(db, username);
    return `Removed ${gone.role} “${gone.username}” and signed them out.`;
  });
}

async function create() {
  let { ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_ROLE: role } = process.env;
  if (!username || !password) {
    if (!process.stdin.isTTY) {
      console.error('Run this in a terminal, or set ADMIN_USERNAME and ADMIN_PASSWORD.');
      process.exitCode = 1;
      return;
    }
    const p = prompter();
    username = await p.ask('Admin username: ');
    password = await p.ask(`Password (at least ${MIN_PASSWORD} characters): `, { secret: true });
    const again = await p.ask('Type the password again: ', { secret: true });
    console.log('An owner can do everything. Staff cannot delete products, erase customer details or read the activity log.');
    role = await p.ask('Role, owner or staff (Enter keeps the current role; the first account is the owner): ');
    p.close();
    if (password !== again) {
      console.error('The two passwords do not match.');
      process.exitCode = 1;
      return;
    }
  }
  await withDb(async (db) => {
    const admin = await upsertAdmin(db, username, password, role?.trim().toLowerCase() || undefined);
    return admin.created ? `Created ${admin.role} “${admin.username}”.` : `Updated the password for ${admin.role} “${admin.username}”.`;
  });
}

if (process.argv.includes('--remove')) await remove(process.argv.slice(2).find((a) => a !== '--remove'));
else await create();
