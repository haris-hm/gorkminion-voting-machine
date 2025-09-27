const Database = require("better-sqlite3");
const path = require("node:path");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));

// Set recommended PRAGMAs
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// Create tables/indexes if they do not exist
db.transaction(() => {
	db
		.prepare(
			`
			CREATE TABLE IF NOT EXISTS ballots (
				id TEXT PRIMARY KEY,
				options TEXT
			)
			`,
		)
		.run();

	db
		.prepare(
			`CREATE TABLE IF NOT EXISTS user_votes (
			ballot_id TEXT,
			user_id TEXT,
			votes_given INTEGER DEFAULT 0,
			votes_available INTEGER,
			options_available TEXT,
			PRIMARY KEY (ballot_id, user_id),
			FOREIGN KEY (ballot_id) REFERENCES ballots(id)
		)`,
		)
		.run();

	db
		.prepare(
			`
				CREATE TABLE IF NOT EXISTS votes (
					ballot_id TEXT,
					post_id INTEGER,
					points INTEGER DEFAULT 0,
					PRIMARY KEY (ballot_id, post_id),
					FOREIGN KEY (ballot_id) REFERENCES ballots(id)
				)
				`,
		)
		.run();
})();

module.exports = db;
