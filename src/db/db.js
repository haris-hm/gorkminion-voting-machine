import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "../../", "data.sqlite"));

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
				options TEXT,
				message_id TEXT,
				channel_id TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				closed INTEGER DEFAULT 0,
				ttl INTEGER DEFAULT 1440,
				winners TEXT DEFAULT '[]'
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
			voting_sequence TEXT,
			voted_message_id TEXT,
			voted_channel_id TEXT,
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

export default db;
