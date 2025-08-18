// src/db/pool.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,  // put this in your .env
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
