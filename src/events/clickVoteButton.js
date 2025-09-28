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
	hasUserVoted,
	getUserVotedMessage,
} from "../db/votes.js";

import {
	votingProcessIntro,
	votePageText,
	postDisplayText,
} from "../utils/templates.js";

import { getBallotOptions } from "../db/ballots.js";

const POSTS_PER_PAGE = 4;

function buildVoteComponents(options, pointValue, page = 0) {
	const components = [];

	const start = page * POSTS_PER_PAGE;
	const end = Math.min(start + POSTS_PER_PAGE, options.length);
	const totalPages = Math.ceil(options.length / POSTS_PER_PAGE);

	const pageOptions = options.slice(start, end);
	const introContent = votePageText(pointValue, page + 1, totalPages);

	components.push(new TextDisplayBuilder().setContent(introContent));

	pageOptions.forEach((option, idx) => {
		const displayText = postDisplayText(option);

		const title = new TextDisplayBuilder().setContent(displayText);
		const section = new SectionBuilder()
			.addTextDisplayComponents(title)
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

		const votedMessage = getUserVotedMessage(ballotId, userId);

		if (votedMessage) {
			try {
				const message = await interaction.client.channels
					.fetch(votedMessage.channelId)
					.then((channel) => channel.messages.fetch(votedMessage.messageId));

				await message.edit({
					content: `<@${userId}> has voted!`,
					allowedMentions: { parse: [] },
				});
			} catch (err) {
				console.error("Error updating voted message:", err);
			}
		}

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
	const introductionContent = votingProcessIntro(
		startingVotesAvailable,
		startingUserVotes,
		alreadyStartedVoting,
	);
	let currentPage = 0;

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

				case "option": {
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
					if (currentPage > 0 && options.length <= currentPage * POSTS_PER_PAGE) {
						currentPage -= 1;
					}

					await handleVoteInteraction(ballotId, userId, i, currentPage);
					break;
				}

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
	const optionIds = options.map((opt) => opt.id);

	const userId = interaction.user.id;

	if (!hasUserVoted(ballotId, userId)) {
		const votingMessage = await interaction.message.reply({
			content: `<@${userId}> has started voting!`,
			allowedMentions: { parse: [] },
		});

		updateUserVoteTable(
			ballotId,
			userId,
			optionIds,
			votingMessage.id,
			votingMessage.channelId,
		);
	}

	startVotingDialogTree(ballotId, interaction);
}
