import {
	ActionRowBuilder,
	ButtonBuilder,
	TextDisplayBuilder,
	SeparatorSpacingSize,
	MessageFlags,
	SeparatorBuilder,
} from "discord.js";
import { getAllBallots, closeBallot, getPost } from "../db/ballots.js";
import { getResults } from "../db/votes.js";
import { getAllUserIds, getUserVotingSequence } from "../db/userVotes.js";
import { postDisplay, winnersDisplay, rankDisplay } from "./templates.js";

async function showVotingStats(ballotId, message) {
	const userIds = getAllUserIds(ballotId);

	let iconVoteResults = [
		"# Full Icon Vote Results",
		"\n",
		"## User Voting Statistics:",
	];

	for (let i = 0; i < userIds.length; i++) {
		const userId = userIds[i];
		const votingSequence = getUserVotingSequence(ballotId, userId);
		iconVoteResults.push(
			`${i + 1}. <@${userId}> voted in the sequence: ${votingSequence.join(
				" -> ",
			)}`,
		);
	}

	iconVoteResults.push("## Points Earned by Each Post:");

	const results = getResults(ballotId);

	results.forEach((postResults) => {
		const post = getPost(ballotId, postResults.postId);
		iconVoteResults.push(
			`- Post: ${post.threadUrl} | Title: ${post.title}\n    - Points Earned: ${postResults.points}`,
		);
	});

	iconVoteResults.push("\nThank you all for participating in the vote! 🎉");

	const voterInfoDisplay = new TextDisplayBuilder().setContent(
		iconVoteResults.join("\n"),
	);

	return await message.reply({
		flags: [MessageFlags.IsComponentsV2],
		components: [voterInfoDisplay],
		allowedMentions: { parse: [] },
	});
}

async function tabulateResults(ballotId, originalMessage) {
	console.log(`Tabulating results for ballot ${ballotId}`);
	const results = getResults(ballotId);

	const pointsMap = {};
	results.forEach((postResults) => {
		if (!pointsMap[postResults.points]) {
			pointsMap[postResults.points] = [];
		}
		pointsMap[postResults.points].push(postResults.postId);
	});

	const ballotMonth = ballotId.split("-")[0].toUpperCase();
	const ballotYear = ballotId.split("-")[1];

	let currentMessage = originalMessage;

	const intro = new TextDisplayBuilder().setContent(
		winnersDisplay(ballotMonth, ballotYear),
	);

	currentMessage = await originalMessage.reply({
		flags: [MessageFlags.IsComponentsV2],
		components: [intro],
	});

	const topFivePoints = Object.keys(pointsMap)
		.map((pt) => parseInt(pt))
		.sort((a, b) => b - a)
		.slice(0, 5);

	const topFivePostIds = [];

	for (let i = 0; i < topFivePoints.length; i++) {
		const currentPointValue = topFivePoints[i];
		const currentPostIds = pointsMap[currentPointValue];

		const rankIntro = new TextDisplayBuilder().setContent(
			rankDisplay(i + 1, currentPointValue),
		);

		const separator = new SeparatorBuilder().setSpacing(
			SeparatorSpacingSize.Large,
		);

		const winnerDisplay = currentPostIds.map((postId, idx) => {
			const post = getPost(ballotId, postId);
			topFivePostIds.push(postId);
			return postDisplay(
				post,
				idx === currentPostIds.length - 1
					? SeparatorSpacingSize.Large
					: SeparatorSpacingSize.Small,
				false,
			);
		});

		const rankComponents = [rankIntro, separator];
		winnerDisplay.forEach((components) => rankComponents.push(...components));
		currentMessage = await currentMessage.reply({
			flags: [MessageFlags.IsComponentsV2],
			components: rankComponents,
		});
	}

	return { winnerIds: topFivePostIds, lastMessage: currentMessage };
}

export async function closeBallots(client) {
	const now = Date.now();
	const ballots = getAllBallots();

	for (const ballot of ballots) {
		console.log(`Checking ballot ${ballot.id}`);
		if (now - new Date(ballot.created_at).getTime() > ballot.ttl) {
			console.log(`Closing ballot ${ballot.id}. TTL: ${ballot.ttl} ms`);

			try {
				const channel = await client.channels.fetch(ballot.channel_id);
				const message = await channel.messages.fetch(ballot.message_id);

				// Disable the vote button
				const oldRow = message.components[message.components.length - 1];
				const disabledRow = ActionRowBuilder.from(oldRow).setComponents(
					oldRow.components.map((btn) =>
						ButtonBuilder.from(btn).setDisabled(true).setLabel("Voting Closed"),
					),
				);

				await message.edit({
					components: [...message.components.slice(0, -1), disabledRow],
					allowedMentions: { parse: [] },
				});

				const results = await tabulateResults(ballot.id, message);
				closeBallot(ballot.id, results.winnerIds);
				const lastMessage = await showVotingStats(ballot.id, results.lastMessage);
			} catch (err) {
				console.error("Failed to close ballot:", err);
			}
		}
	}
}
