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
import { postDisplay, winnersDisplay } from "./templates.js";

async function tabulateResults(ballotId, originalMessage) {
	console.log(`Tabulating results for ballot ${ballotId}`);
	const results = getResults(ballotId);

	const topFive = results.slice(0, 5);
	const ballotMonth = ballotId.split("-")[0].toUpperCase();
	const ballotYear = ballotId.split("-")[1];

	const intro = new TextDisplayBuilder().setContent(
		winnersDisplay(ballotMonth, ballotYear),
	);

	const separator = new SeparatorBuilder().setSpacing(
		SeparatorSpacingSize.Large,
	);

	const posts = topFive.map((result, idx) => {
		const post = getPost(ballotId, result.postId);
		return postDisplay(
			post,
			idx === topFive.length - 1
				? SeparatorSpacingSize.Large
				: SeparatorSpacingSize.Small,
			false,
			`\n**Points Earned: ${result.points}**`,
		);
	});

	const components = [intro, separator];

	posts.forEach((post, idx) => {
		const rankText = new TextDisplayBuilder().setContent(`## Winner #${idx + 1}`);
		components.push(rankText, ...post);
	});

	const seeFullResultsButton = new ButtonBuilder()
		.setCustomId(`see-full-results-${ballotId}`)
		.setLabel("See Full Results")
		.setStyle("Primary")
		.setEmoji("📊");

	originalMessage.reply({
		flags: [MessageFlags.IsComponentsV2],
		components: components,
	});

	return topFive.map((result) => result.postId);
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

				const winners = await tabulateResults(ballot.id, message);
				console.log("Winners:", winners);
				closeBallot(ballot.id, winners);
			} catch (err) {
				console.error("Failed to close ballot:", err);
			}
		}
	}
}
