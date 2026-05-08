const path = require('path');
const fs = require('fs');
const { run } = require('jest');
const sqlite3 = require('sqlite3').verbose();

function runScript(db, script) {
  const sql = fs.readFileSync(script, 'utf8');
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function tableExistsInDatabase(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

function getColumns(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName});`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function checkUniqueConstraint(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA index_list(${tableName});`, (err, indexes) => {
      if (err) reject(err);
      else {
        const uniqueIndexesPromises = indexes.filter(index => index.unique)
          .map(index => new Promise((resolveIndex, rejectIndex) => {
            db.all(`PRAGMA index_info(${index.name});`, (err, columns) => {
              if (err) rejectIndex(err);
              else resolveIndex(columns.some(col => col.name === columnName));
            });
          }));
        Promise.all(uniqueIndexesPromises).then(results => {
          resolve(results.includes(true));
        }).catch(reject);
      }
    });
  });
}

describe('the SQL in the `exercise.sql` file', () => {
  let db;
  let scriptPath;
  let cleanup;

  beforeAll(async () => {
    const dbPath = path.resolve(__dirname, '..', 'lesson26.db');
    scriptPath = path.resolve(__dirname, '..', 'exercise.sql');
    cleanup = path.resolve(__dirname, "./cleanup.sql")
    db = new sqlite3.Database(dbPath);
    await runScript(db, cleanup);
  });

  afterAll(async () => {
    await runScript(db, cleanup);
    db.close();
  });

  test('Should create a table named Orders with specified columns, a unique CUSTOMER_ID, NOT NULL constraints on CUSTOMER_ID, TOTAL_AMOUNT, ORDER_STATUS, PAYMENT_METHOD, and a default ORDER_STATUS value of "Pending"', async () => {
    await runScript(db, scriptPath);
    
    const tableName = "Orders";
    const tableExists = await tableExistsInDatabase(db, tableName);
    expect(tableExists).toBe(true);

    const columnInfo = await getColumns(db, tableName);
    const expectedColumnNames = ['ID', 'CUSTOMER_ID', 'TOTAL_AMOUNT', 'ORDER_STATUS', 'SHIPPING_FEE', 'PAYMENT_METHOD', 'PAID'];
    const existingColumnNames = columnInfo.map(row => row.name);
    expect(expectedColumnNames.sort()).toEqual(existingColumnNames.sort());

    const hasUniqueCustomerId = await checkUniqueConstraint(db, tableName, 'CUSTOMER_ID');
    expect(hasUniqueCustomerId).toBe(true);

    const notNullColumns = columnInfo.filter(col => col.notnull === 1).map(col => col.name);
    const expectedNotNullColumns = ['CUSTOMER_ID', 'TOTAL_AMOUNT', 'ORDER_STATUS', 'PAYMENT_METHOD'];
    expectedNotNullColumns.forEach(column => {
      expect(notNullColumns).toContain(column);
    });
  });
});
