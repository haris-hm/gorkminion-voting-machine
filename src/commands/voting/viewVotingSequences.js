import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
} from "discord.js";

import { getAllUserIds, getUserVotingSequence } from "../../db/userVotes.js";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
	.setName("view_voting_sequences")
	.setDescription("Allows an admin to see how each person in the server voted.")
	.addStringOption((option) =>
		option
			.setName("month")
			.setDescription("The month of the ballot being viewed.")
			.setRequired(true)
			.addChoices(
				{ name: "January", value: "January" },
				{ name: "February", value: "February" },
				{ name: "March", value: "March" },
				{ name: "April", value: "April" },
				{ name: "May", value: "May" },
				{ name: "June", value: "June" },
				{ name: "July", value: "July" },
				{ name: "August", value: "August" },
				{ name: "September", value: "September" },
				{ name: "October", value: "October" },
				{ name: "November", value: "November" },
				{ name: "December", value: "December" },
			),
	)
	.addIntegerOption((option) =>
		option
			.setName("year")
			.setDescription("The year of the ballot being viewed.")
			.setRequired(true)
			.setMinValue(CURRENT_YEAR - 5)
			.setMaxValue(CURRENT_YEAR + 5)
			.addChoices(
				{
					name: String(CURRENT_YEAR),
					value: CURRENT_YEAR,
				},
				{
					name: String(CURRENT_YEAR - 1),
					value: CURRENT_YEAR - 1,
				},
				{
					name: String(CURRENT_YEAR + 1),
					value: CURRENT_YEAR + 1,
				},
			),
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	const month = interaction.options.getString("month");
	const year = interaction.options.getInteger("year");

	const ballotId = `${month}-${year}`.toLowerCase();
	const userIds = getAllUserIds(ballotId);

	const userVotingSequenceText = ["## User Voting Statistics:", "\n"];

	for (let i = 0; i < userIds.length; i++) {
		const userId = userIds[i];
		const votingSequence = getUserVotingSequence(ballotId, userId);
		userVotingSequenceText.push(
			`${i + 1}. <@${userId}> voted in the sequence: ${votingSequence.join(
				" -> ",
			)}`,
		);
	}

	return await interaction.reply({
		content: userVotingSequenceText.join("\n"),
		allowedMentions: { parse: [] },
		flags: MessageFlags.Ephemeral,
	});
}
