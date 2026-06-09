import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function init() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
  await connection.query(sql);
  console.log('Database initialized successfully!');
  await connection.end();
}

init().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
