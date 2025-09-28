import {
	Events,
	MessageFlags,
	ActionRowBuilder,
	ButtonBuilder,
	TextDisplayBuilder,
	ComponentType,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
} from "discord.js";
import db from "../db.js";

export const name = Events.InteractionCreate;

function calculateVotesAvailable(options) {
	return Math.ceil(options.length * 0.75);
}

function updateUserVoteTable(ballotId, userId, options) {
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

function getUserVotes(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT votes_given FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return row ? row.votes_given : 0;
}

function getVotesAvailable(ballotId, userId) {
	const row = db
		.prepare(
			`SELECT votes_available FROM user_votes 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.get(ballotId, userId);
	return row ? row.votes_available : 0;
}

function incrementUserVotes(ballotId, userId) {
	db
		.prepare(
			`UPDATE user_votes 
			SET votes_given = votes_given + 1 
			WHERE ballot_id = ? AND user_id = ?`,
		)
		.run(ballotId, userId);
}

function getOptionsAvailable(ballotId, userId) {
	const row = db
		.prepare(
			"SELECT options_available FROM user_votes WHERE ballot_id = ? AND user_id = ?",
		)
		.get(ballotId, userId);
	return row && row.options_available ? JSON.parse(row.options_available) : [];
}

function getCurrentPointValue(ballotId, userId) {
	const votesAvailable = getVotesAvailable(ballotId, userId);
	const userVotes = getUserVotes(ballotId, userId);
	return votesAvailable - userVotes;
}

function recordVote(ballotId, postId, userId) {
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

function buildVoteComponents(options, pointValue, page = 0, pageSize = 4) {
	const components = [];

	const start = page * pageSize;
	const end = Math.min(start + pageSize, options.length);
	const pageOptions = options.slice(start, end);
	const totalPages = Math.ceil(options.length / pageSize);

	let introContent = `Please select the icon you want to award ${pointValue} points to.`;

	if (totalPages > 1) {
		introContent += `\n\n**(Page ${page + 1}/${totalPages})**`;
	}

	components.push(new TextDisplayBuilder().setContent(introContent));

	pageOptions.forEach((option, idx) => {
		const title = new TextDisplayBuilder().setContent(
			`### ${option.id}. **${option.title}**`,
		);
		const description = new TextDisplayBuilder().setContent(
			`**Created by <@${option.author}>**\n*Original Post: ${option.threadUrl}*`,
		);
		const section = new SectionBuilder()
			.addTextDisplayComponents(title, description)
			.setThumbnailAccessory((thumbnail) => thumbnail.setURL(option.imageUrl));
		const voteButton = new ButtonBuilder()
			.setCustomId(`voteOption:${option.id}`)
			.setLabel(`Vote for ${option.id}`)
			.setStyle("Primary");
		const actionRow = new ActionRowBuilder().addComponents(voteButton);
		const separator = new SeparatorBuilder().setSpacing(
			idx === pageOptions.length - 1
				? SeparatorSpacingSize.Large
				: SeparatorSpacingSize.Small,
		);
		components.push(section, actionRow, separator);
	});

	// Add navigation buttons if needed
	const navRow = new ActionRowBuilder();
	if (page > 0) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`votePage:prev:${page - 1}`)
				.setLabel("Previous")
				.setStyle("Secondary"),
		);
	}
	if (end < options.length) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`votePage:next:${page + 1}`)
				.setLabel("Next")
				.setStyle("Secondary"),
		);
	}
	if (navRow.components.length > 0) {
		components.push(navRow);
	}

	return components;
}

async function handleVoteInteraction(ballotId, userId, interaction, page = 0) {
	const votesAvailable = getVotesAvailable(ballotId, userId);
	const userVotes = getUserVotes(ballotId, userId);

	const pointValue = votesAvailable - userVotes;

	if (pointValue === 0) {
		await interaction.update({
			components: [
				new TextDisplayBuilder().setContent(
					"You have finished voting. Thank you for your participation!",
				),
			],
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		});
		return;
	}

	const options = getOptionsAvailable(ballotId, userId);
	const components = buildVoteComponents(options, pointValue, page);

	await interaction.update({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: components,
		allowedMentions: { parse: [] },
	});
}

async function startVotingDialogTree(ballotId, interaction) {
	const userId = interaction.user.id;

	const startingVotesAvailable = getVotesAvailable(ballotId, userId);
	const startingUserVotes = getUserVotes(ballotId, interaction.user.id);

	if (startingUserVotes >= startingVotesAvailable) {
		await interaction.reply({
			content: "You have already used all your votes for this ballot.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const alreadyStartedVoting = startingUserVotes > 0;

	let introductionContent = `
## Voting Process

You can vote for up to **${startingVotesAvailable}** options in this ballot. You will rank your choices from 1 to ${startingVotesAvailable}. Your number 1 choice will receive ${startingVotesAvailable} points. Subsequent choices will receive a diminishing amount of points until the last choice, which will receive 1 point.

When you're ready, please click the start button below to begin the voting process.
	`;

	if (alreadyStartedVoting) {
		introductionContent += `\n-# **Note:** *You have already started voting. Clicking start again will resume your voting process. You have used **${startingUserVotes}** out of **${startingVotesAvailable}** votes.*`;
	}

	const introduction = new TextDisplayBuilder().setContent(introductionContent);

	const startButton = new ButtonBuilder()
		.setCustomId(`startVoting:${ballotId}`)
		.setLabel(alreadyStartedVoting ? "Resume Voting" : "Start Voting")
		.setStyle("Primary")
		.setEmoji("✅");

	const row = new ActionRowBuilder().addComponents(startButton);

	const response = await interaction.reply({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: [introduction, row],
		withResponse: true,
	});

	const collector = response.resource.message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time: 1000 * 60 * 24,
		filter: (i) => i.user.id === interaction.user.id,
	});

	let currentPage = 0;

	collector.on("collect", async (i) => {
		try {
			if (i.customId.startsWith("startVoting")) {
				currentPage = 0;
				await handleVoteInteraction(ballotId, userId, i, currentPage);
			} else if (i.customId.startsWith("voteOption")) {
				const optionId = i.customId.split(":")[1];
				const result = recordVote(ballotId, optionId, interaction.user.id);

				if (!result) {
					await i.update({
						components: [
							new TextDisplayBuilder().setContent(
								"Nice try! I know, I know, literally 1984 or whatever. 🤓",
							),
						],
						flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
					});
					collector.stop();
					return;
				}

				const options = getOptionsAvailable(ballotId, userId);
				const goBackOnePage = currentPage > 0 && options.length <= currentPage * 4;
				if (goBackOnePage) currentPage -= 1;

				await handleVoteInteraction(ballotId, userId, i, currentPage);
			} else if (i.customId.startsWith("votePage:prev")) {
				currentPage = Math.max(0, currentPage - 1);
				await handleVoteInteraction(ballotId, userId, i, currentPage);
			} else if (i.customId.startsWith("votePage:next")) {
				currentPage += 1;
				await handleVoteInteraction(ballotId, userId, i, currentPage);
			}
			collector.resetTimer();
		} catch (err) {
			console.error("Error handling interaction:", err);
			if (!i.replied && !i.deferred) {
				await i.reply({
					content: "An error occurred.",
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	});
}

export async function execute(interaction) {
	if (!interaction.isButton()) return;
	if (!interaction.customId.includes("vote:")) return;

	const ballotId = interaction.customId.split(":", 2)[1];
	const row = db
		.prepare("SELECT options FROM ballots WHERE id = ?")
		.get(ballotId);
	const options = row ? JSON.parse(row.options) : [];

	updateUserVoteTable(ballotId, interaction.user.id, options);
	startVotingDialogTree(ballotId, interaction);
}
