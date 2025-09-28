import {
	ActionRowBuilder,
	ButtonBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
} from "discord.js";

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
		`Please select the icon you want to award **${pointValue} points** to.`,
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
		return `## 🗳️ ${month} ${year} Server Icon Ballot *(cont.)*\n\n`;
	}

	const content = [
		`## 🗳️ ${month} ${year} Server Icon Ballot`,
		"",
		"It's time to vote for your favorite icons! Here are all the submissions of this month:",
		"",
	];

	return joinLines(content);
}

export function postDisplay(
	post,
	separatorSpacing,
	button = false,
	extraInfo = "",
) {
	let displayText = postDisplayText(post);
	const components = [];

	if (extraInfo) {
		displayText += `\n${extraInfo}`;
	}

	const title = new TextDisplayBuilder().setContent(displayText);
	const section = new SectionBuilder()
		.addTextDisplayComponents(title)
		.setThumbnailAccessory((thumbnail) => thumbnail.setURL(post.imageUrl));
	const voteButton = new ButtonBuilder()
		.setCustomId(`vote:option:${post.id}`)
		.setLabel(`Vote for ${post.id}`)
		.setStyle("Success")
		.setEmoji("✅");
	const actionRow = new ActionRowBuilder().addComponents(voteButton);
	const separator = new SeparatorBuilder().setSpacing(
		separatorSpacing || SeparatorSpacingSize.Large,
	);

	components.push(section);
	if (button) {
		components.push(actionRow);
	}
	components.push(separator);

	return components;
}

export function winnersDisplay(month, year) {
	const content = [
		`## 🏆 Winners for ${month} ${year} 🏆`,
		"",
		"It's time to reveal the winners of this month's icon ballot! Here are the top icons that received the highest votes:",
		"",
	];

	return joinLines(content);
}

export function rankDisplay(rank, points) {
	const content = [
		`## ${
			rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏆"
		} Rank ${rank}: `,
		`Here are the posts which earned **${points} points**:`,
		"",
	];

	return joinLines(content);
}
