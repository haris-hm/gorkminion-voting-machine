function joinLines(lines) {
	return lines.join("\n");
}

export function votingProcessIntro(
	votesAvailable,
	userVotes = 0,
	showNote = false,
) {
	const content = [
		"## Voting Process",
		"",
		`You can vote for up to **${votesAvailable}** options in this ballot. You will rank your choices from 1 to ${votesAvailable}. Your number 1 choice will receive ${votesAvailable} points. Subsequent choices will receive a diminishing amount of points until the last choice, which will receive 1 point.`,
		"",
		"When you're ready, please click the start button below to begin the voting process.",
	];

	if (showNote) {
		content.push(
			"",
			`-# **Note:** *You have already started voting. Clicking start again will resume your voting process. You have used **${userVotes}** / **${votesAvailable}** votes.*`,
		);
	}

	return joinLines(content);
}

export function votePageText(pointValue, page, totalPages) {
	const content = [
		`Please select the icon you want to award ${pointValue} points to.`,
	];

	if (totalPages > 1) {
		content.push("", `**(Page ${page}/${totalPages})**`);
	}

	return joinLines(content);
}

export function postDisplayText(post) {
	const content = [
		`### ${post.id}. **${post.title}**`,
		`**Created by <@${post.author}>**`,
		`*Original Post: ${post.threadUrl}*`,
	];

	return joinLines(content);
}

export function ballotIntro(month, year, continuation = false) {
	if (continuation) {
		return `## 🗳️ ${month} ${year} Ballot *(cont.)*\n\n`;
	}

	const content = [
		`## 🗳️ ${month} ${year} Ballot`,
		"",
		"It's time to vote for your favorite icons! Here are all the submissions of this month:",
		"",
	];

	return joinLines(content);
}
