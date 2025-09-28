import db from "./db.js";

export function calculateVotesAvailable(options) {
	return Math.ceil(options.length * 0.75);
}

export function updateUserVoteTable(
	ballotId,
	userId,
	options,
	messageId,
	channelId,
) {
	db
		.prepare(
			`INSERT OR IGNORE INTO user_votes 
			(ballot_id, user_id, votes_given, votes_available, options_available, voting_sequence, voted_message_id, voted_channel_id) 
			VALUES (?, ?, 0, ?, ?, '[]', ?, ?)
			`,
		)
		.run(
			ballotId,
			userId,
			calculateVotesAvailable(options),
			JSON.stringify(options),
			messageId,
			channelId,
		);
}

export function getUserVotedMessage(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT voted_message_id, voted_channel_id FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return row
		? { messageId: row.voted_message_id, channelId: row.voted_channel_id }
		: null;
}

export function updateUserVotingSequence(ballotId, userId, postId) {
	const row = db
		.prepare(
			`SELECT voting_sequence FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);

	if (row) {
		const currentSequence = JSON.parse(row.voting_sequence || "[]");
		currentSequence.push(parseInt(postId));
		db
			.prepare(
				`UPDATE user_votes 
				SET voting_sequence = ?
				WHERE ballot_id = ? AND user_id = ?`,
			)
			.run(JSON.stringify(currentSequence), ballotId, userId);
	}
}

export function hasUserVoted(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT 1 FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return Boolean(row);
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
	const optionsRow = db
		.prepare("SELECT options FROM ballots WHERE id = ?")
		.get(ballotId);
	if (!optionsRow) return [];

	const optionIdsAvailable = db
		.prepare(
			"SELECT options_available FROM user_votes WHERE ballot_id = ? AND user_id = ?",
		)
		.get(ballotId, userId);

	const allOptions = JSON.parse(optionsRow.options);
	const availableOptions = optionIdsAvailable
		? JSON.parse(optionIdsAvailable.options_available).map((id) => parseInt(id))
		: [];

	return Array.from(
		allOptions.filter((option) =>
			availableOptions.some((availOption) => availOption === parseInt(option.id)),
		),
	);
}

export function getOptionIdsAvailable(ballotId, userId) {
	const optionIdsAvailable = db
		.prepare(
			"SELECT options_available FROM user_votes WHERE ballot_id = ? AND user_id = ?",
		)
		.get(ballotId, userId);

	return optionIdsAvailable
		? JSON.parse(optionIdsAvailable.options_available).map((id) => parseInt(id))
		: [];
}

export function getCurrentPointValue(ballotId, userId) {
	const votesAvailable = getVotesAvailable(ballotId, userId);
	const userVotes = getUserVotes(ballotId, userId);
	return votesAvailable - userVotes;
}

export function recordVote(ballotId, postId, userId) {
	const pointsValue = getCurrentPointValue(ballotId, userId);
	if (pointsValue <= 0) return false;

	const options = getOptionIdsAvailable(ballotId, userId);
	if (!options.includes(parseInt(postId))) {
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

	const newOptions = options.filter((option) => option !== parseInt(postId));

	db
		.prepare(
			`UPDATE user_votes
			SET options_available = ?
			WHERE ballot_id = ? AND user_id = ?
			`,
		)
		.run(JSON.stringify(newOptions), ballotId, userId);

	incrementUserVotes(ballotId, userId);
	updateUserVotingSequence(ballotId, userId, postId);
	return true;
}
