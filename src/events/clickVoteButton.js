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

	db
		.prepare(
			`UPDATE votes
			SET points = points + ?
			WHERE ballot_id = ? AND post_id = ?
			`,
		)
		.run(pointsValue, ballotId, postId);

	const newOptions = getOptionsAvailable(ballotId, userId).filter(
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
}

async function handleVoteInteraction(ballotId, userId, interaction) {
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
	const optionButtons = options.map((option) => {
		return new ButtonBuilder()
			.setCustomId(`voteOption:${option.id}`)
			.setLabel(option.title)
			.setStyle("Primary");
	});

	const rows = [];
	for (let i = 0; i < optionButtons.length && rows.length < 5; i += 5) {
		rows.push(
			new ActionRowBuilder().addComponents(optionButtons.slice(i, i + 5)),
		);
	}

	const instruction = new TextDisplayBuilder().setContent(
		`Please select the icon you want to award ${pointValue} points to.`,
	);

	await interaction.update({
		flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
		components: [instruction, ...rows],
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

	const introduction = new TextDisplayBuilder().setContent(
		`## Voting Process\nYou can vote for up to **${startingVotesAvailable}** options in this ballot. You will rank your choices from 1 to ${startingVotesAvailable}. Your number 1 choice will receive ${startingVotesAvailable} points. Subsequent choices will receive a diminishing amount of points until the last choice, which will receive 1 point.\n\nWhen you're ready, please click the start button below to begin the voting process.`,
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
				await handleVoteInteraction(ballotId, userId, i);
			} else if (i.customId.startsWith("voteOption")) {
				const optionId = i.customId.split(":")[1];
				recordVote(ballotId, optionId, interaction.user.id);
				await handleVoteInteraction(ballotId, userId, i);
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

	updateUserVoteTable(ballotId, interaction.user.id, options);
	startVotingDialogTree(ballotId, interaction);
}
