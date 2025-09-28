import db from "./db.js";

export function updateVotes(ballotId, optionId, delta) {
	db
		.prepare(
			`UPDATE votes
			SET points = points + ?
			WHERE ballot_id = ? AND post_id = ?
			`,
		)
		.run(delta, ballotId, optionId);
}

export function getResults(ballotId) {
	return db
		.prepare(
			`SELECT post_id, points
            FROM votes
            WHERE ballot_id = ?
            ORDER BY points DESC
            `,
		)
		.all(ballotId)
		.map((row) => ({ postId: row.post_id, points: row.points }));
}
