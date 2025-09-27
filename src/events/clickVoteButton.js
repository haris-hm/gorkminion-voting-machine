import {
	Events,
	MessageFlags,
	ActionRowBuilder,
	ButtonBuilder,
	TextDisplayBuilder,
	ComponentType,
} from "discord.js";
import db from "../db.js";

export const name = Events.InteractionCreate;

async function handleVoteInteraction(
	ballotId,
	options,
	interaction,
	pointValue,
) {
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
	const optionButtons = options.map((option) => {
		return new ButtonBuilder()
			.setCustomId(`voteOption:${option.id}`)
			.setLabel(option.title)
			.setStyle("Primary");
	});

	const rows = [];
	for (let i = 0; i < optionButtons.length; i++) {
		const row = new ActionRowBuilder().addComponents(optionButtons[i]);
		rows.push(row);
	}

	const instruction = new TextDisplayBuilder().setContent(
		`Please select the icon you want to award ${pointValue} points to.`,
	);

	await interaction.update({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: [instruction, ...rows],
		withResponse: true,
	});
}

async function startVotingDialogTree(ballotId, options, interaction) {
	const numberOfVotes = Math.ceil(options.length * 0.75);

	let currentOptions = [...options];
	let currentPointValue = numberOfVotes;

	const introduction = new TextDisplayBuilder().setContent(
		`## Voting Process\nYou can vote for up to **${numberOfVotes}** options in this ballot. You will rank your choices from 1 to ${numberOfVotes}. Your number 1 choice will receive ${numberOfVotes} points. Subsequent choices will receive a diminishing amount of points until the last choice, which will receive 1 point.\n\nWhen you're ready, please click the start button below to begin the voting process.`,
	);

	const startButton = new ButtonBuilder()
		.setCustomId(`startVoting:${ballotId}`)
		.setLabel("Start Voting")
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
			if (i.customId.startsWith("startVoting")) {
				await handleVoteInteraction(ballotId, options, i, numberOfVotes);
			} else if (i.customId.startsWith("voteOption")) {
				const optionId = parseInt(i.customId.split(":")[1]);
				currentOptions = currentOptions.filter((option) => {
					parseInt(option.id) !== optionId;
				});
				currentPointValue -= 1;
				await handleVoteInteraction(ballotId, currentOptions, i, currentPointValue);
			}
			collector.resetTimer();
		} catch (err) {
			console.error("Error handling interaction:", err);
			if (!i.replied && !i.deferred) {
				await i.reply({ content: "An error occurred.", ephemeral: true });
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

	startVotingDialogTree(ballotId, options, interaction);
}
