import db from "./db.js";

export function getBallot(ballotId) {
	return db.prepare("SELECT id FROM ballots WHERE id = ?").get(ballotId);
}

export function getAllBallots() {
	return db
		.prepare(
			"SELECT id, message_id, channel_id, created_at, ttl FROM ballots WHERE closed = 0",
		)
		.all();
}

export function closeBallot(ballotId, winnerIds) {
	db
		.prepare("UPDATE ballots SET winners = ? WHERE id = ?")
		.run(JSON.stringify(winnerIds), ballotId);

	db.prepare("UPDATE ballots SET closed = 1 WHERE id = ?").run(ballotId);
}

export function getBallotOptions(ballotId) {
	return db.prepare("SELECT options FROM ballots WHERE id = ?").get(ballotId);
}

export function upsertBallotAndDefinePosts(
	ballotId,
	posts,
	messageId,
	channelId,
	ttl,
) {
	const ballotUpsert = db.prepare(`
        INSERT INTO ballots (id, options, message_id, channel_id, created_at, ttl)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO 
			UPDATE SET options = excluded.options, 
					   message_id = excluded.message_id, 
					   channel_id = excluded.channel_id, 
					   created_at = excluded.created_at, 
					   ttl = excluded.ttl, 
					   closed = 0
    `);
	const insertVote = db.prepare(`
        INSERT OR IGNORE INTO votes (ballot_id, post_id, points)
        VALUES (?, ?, 0)
    `);

	db.transaction(() => {
		ballotUpsert.run(
			ballotId,
			JSON.stringify(posts),
			messageId,
			channelId,
			new Date().toISOString(),
			ttl,
		);

		for (const post of posts) {
			insertVote.run(ballotId, post.id);
		}
	})();
}

export function getPost(ballotId, postId) {
	const optionsRow = db
		.prepare("SELECT options FROM ballots WHERE id = ?")
		.get(ballotId);

	if (!optionsRow) return null;

	const options = JSON.parse(optionsRow.options);
	return options.find((post) => post.id === postId);
}
