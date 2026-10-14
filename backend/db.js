const mysql = require("mysql2/promise");
require("dotenv").config();

const cfg = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};
const DB = process.env.DB_NAME || "resume_analyzer";
let pool;

async function initDb() {
  const boot = await mysql.createConnection(cfg);
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\``);
  await boot.end();
  pool = mysql.createPool({ ...cfg, database: DB, connectionLimit: 5 });
  const t = [
    `CREATE TABLE IF NOT EXISTS resumes (id INT AUTO_INCREMENT PRIMARY KEY, file_name VARCHAR(255), extracted_text LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS job_descriptions (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), description LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS analysis (id INT AUTO_INCREMENT PRIMARY KEY, resume_id INT, job_id INT, match_score INT, matched_skills JSON, missing_skills JSON, ai_feedback JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS interview_questions (id INT AUTO_INCREMENT PRIMARY KEY, analysis_id INT, question TEXT, category VARCHAR(100), difficulty VARCHAR(20))`,
  ];
  for (const q of t) await pool.query(q);
  console.log("MySQL ready:", DB);
}

module.exports = { initDb, q: (...a) => pool.query(...a) };
