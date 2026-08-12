const assert = require('node:assert/strict');
const test = require('node:test');
const { promisify } = require('node:util');
const sqlite3 = require('sqlite3').verbose();
const { initSchema } = require('../db');
const {
  listConversations,
  getConversationById,
  getOrCreateConversation,
  addMessage,
} = require('../services/conversationsService');

function createDatabase() {
  const db = new sqlite3.Database(':memory:');

  db.runAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (error) {
        if (error) return reject(error);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };
  db.getAsync = promisify(db.get.bind(db));
  db.allAsync = promisify(db.all.bind(db));
  db.execAsync = promisify(db.exec.bind(db));

  return db;
}

test('crée une conversation unique et conserve ses messages', async () => {
  const db = createDatabase();

  await initSchema(db);
  await db.execAsync(`
    INSERT INTO users(id, name, role) VALUES
      (1, 'Alice', 'client'),
      (2, 'Nathalie', 'owner'),
      (3, 'Marc', 'client');
  `);

  const created = await getOrCreateConversation(db, 1, 2);
  const reused = await getOrCreateConversation(db, 1, 2);

  assert.equal(created.id, reused.id);
  assert.equal(created.participantName, 'Nathalie');
  assert.equal((await listConversations(db, 1)).length, 1);
  assert.equal(await getConversationById(db, created.id, 3), null);

  const sent = await addMessage(db, created.id, 1, 'Bonjour Nathalie');
  const received = await getConversationById(db, created.id, 2);

  assert.equal(sent.preview, 'Bonjour Nathalie');
  assert.equal(sent.messages[0].authorName, 'Vous');
  assert.equal(received.messages[0].authorName, 'Alice');
  assert.equal(received.messages[0].isCurrentUser, false);

  await promisify(db.close.bind(db))();
});
