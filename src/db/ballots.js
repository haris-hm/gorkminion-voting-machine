import db from "../db.js";

export function getBallot(ballotId) {
	return db.prepare("SELECT id FROM ballots WHERE id = ?").get(ballotId);
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
