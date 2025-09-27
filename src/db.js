const Database = require("better-sqlite3");
const path = require("node:path");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));

module.exports = db;
