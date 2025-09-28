import db from "./db.js";

export function calculateVotesAvailable(options) {
	return Math.ceil(options.length * 0.75);
}

export function updateUserVoteTable(ballotId, userId, options) {
	db
		.prepare(
			`INSERT OR IGNORE INTO user_votes 
			(ballot_id, user_id, votes_given, votes_available, options_available) 
			VALUES (?, ?, 0, ?, ?)
			`,
		)
		.run(
			ballotId,
			userId,
			calculateVotesAvailable(options),
			JSON.stringify(options),
		);
}

export function getUserVotes(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT votes_given FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return row ? row.votes_given : 0;
}

export function getVotesAvailable(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT votes_available FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return row ? row.votes_available : 0;
}

export function incrementUserVotes(ballotId, userId) {
	db
		.prepare(
			`UPDATE user_votes 
			SET votes_given = votes_given + 1 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.run(ballotId, userId);
}

export function getOptionsAvailable(ballotId, userId) {
	const row = db
		.prepare(
			"SELECT options_available FROM user_votes WHERE ballot_id = ? AND user_id = ?",
		)
		.get(ballotId, userId);
	return row && row.options_available ? JSON.parse(row.options_available) : [];
}

export function getCurrentPointValue(ballotId, userId) {
	const votesAvailable = getVotesAvailable(ballotId, userId);
	const userVotes = getUserVotes(ballotId, userId);
	return votesAvailable - userVotes;
}

export function recordVote(ballotId, postId, userId) {
	const pointsValue = getCurrentPointValue(ballotId, userId);
	if (pointsValue <= 0) return false;

	const options = getOptionsAvailable(ballotId, userId);
	if (!options.find((option) => parseInt(option.id) === parseInt(postId))) {
		return false;
	}

	db
		.prepare(
			`UPDATE votes
			SET points = points + ?
			WHERE ballot_id = ? AND post_id = ?
			`,
		)
		.run(pointsValue, ballotId, postId);

	const newOptions = options.filter(
		(option) => parseInt(option.id) !== parseInt(postId),
	);

	db
		.prepare(
			`UPDATE user_votes
			SET options_available = ?
			WHERE ballot_id = ? AND user_id = ?
			`,
		)
		.run(JSON.stringify(newOptions), ballotId, userId);

	incrementUserVotes(ballotId, userId);
	return true;
}
