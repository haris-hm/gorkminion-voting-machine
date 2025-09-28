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
import {
	getOptionsAvailable,
	getUserVotes,
	getVotesAvailable,
	updateUserVoteTable,
	recordVote,
} from "../db/votes.js";
import { getBallotOptions } from "../db/ballots.js";

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
			.setCustomId(`vote:option:${option.id}`)
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
				.setCustomId("vote:page:prev")
				.setLabel("Previous")
				.setStyle("Secondary"),
		);
	}
	if (end < options.length) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId("vote:page:next")
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
		.setCustomId(`vote:start:${ballotId}`)
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
			const buttonDefinition = i.customId.split(":");

			const buttonType = buttonDefinition[0];
			const buttonAction = buttonDefinition[1];
			const buttonArg = buttonDefinition[2];

			if (buttonType !== "vote") {
				return;
			}

			switch (buttonAction) {
				case "start":
					currentPage = 0;
					await handleVoteInteraction(ballotId, userId, i, currentPage);
					break;

				case "option":
					const result = recordVote(ballotId, buttonArg, interaction.user.id);

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
					if (currentPage > 0 && options.length <= currentPage * 4) currentPage -= 1;

					await handleVoteInteraction(ballotId, userId, i, currentPage);
					break;

				case "page":
					switch (buttonArg) {
						case "prev":
							currentPage = Math.max(0, currentPage - 1);
							break;
						case "next":
							currentPage += 1;
							break;
						default:
							console.warn("Unknown page button argument:", buttonArg);
							return;
					}

					await handleVoteInteraction(ballotId, userId, i, currentPage);
					break;

				default:
					console.warn("Unknown button action:", buttonAction);
					break;
			}
		} catch (err) {
			console.error("Error handling interaction:", err);

			if (!i.replied && !i.deferred) {
				await i.reply({
					content: "An error occurred.",
					flags: MessageFlags.Ephemeral,
				});
			}
		} finally {
			collector.resetTimer();
		}
	});
}

export const name = Events.InteractionCreate;

export async function execute(interaction) {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith("vote:ballot:")) return;

	const ballotId = interaction.customId.split(":", 3)[2];
	const row = getBallotOptions(ballotId);
	const options = row ? JSON.parse(row.options) : [];

	updateUserVoteTable(ballotId, interaction.user.id, options);
	startVotingDialogTree(ballotId, interaction);
}
