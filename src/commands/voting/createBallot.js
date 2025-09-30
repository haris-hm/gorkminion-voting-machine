import {
	SlashCommandBuilder,
	ChannelType,
	MessageFlags,
	TextDisplayBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	PermissionFlagsBits,
} from "discord.js";

import { upsertBallotAndDefinePosts, getBallot } from "../../db/ballots.js";
import { postDisplay, ballotIntro } from "../../utils/templates.js";

const SUBMISSIONS_CHANNEL = process.env.SUBMISSIONS_CHANNEL;
const PARTICIPANT_ROLE_ID = process.env.PARTICIPANT_ROLE_ID;
const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

async function getPostsFromThreads(threads) {
	const posts = [];

	const threadsArray = Array.from(threads.values());

	for (let i = 0; i < threadsArray.length; i++) {
		const thread = threadsArray[i];
		let imageUrl;

		try {
			const starterMessage = await thread.fetchStarterMessage();
			if (!starterMessage) continue;

			const imageAttachment = [...starterMessage.attachments.values()].find(
				(att) => att.contentType && att.contentType.startsWith("image/"),
			);
			if (!imageAttachment) {
				continue;
			}

			imageUrl = imageAttachment.url;
		} catch (err) {
			console.error(
				`Failed to fetch starter message for thread ${thread.id}:`,
				err,
			);
			continue;
		}

		posts.push({
			id: i + 1,
			author: thread.ownerId,
			title: thread.name,
			threadUrl: `https://discord.com/channels/${thread.guild.id}/${thread.id}`,
			imageUrl: imageUrl,
		});
	}

	return posts;
}

function buildPostsDisplay(posts) {
	const components = [];

	posts.forEach((post, idx) => {
		components.push(
			...postDisplay(
				post,
				idx === posts.length - 1
					? SeparatorSpacingSize.Large
					: SeparatorSpacingSize.Small,
				false,
			),
		);
	});
	return components;
}

function buildBallotDisplay(
	month,
	year,
	ballotId,
	posts,
	intro = true,
	outro = true,
) {
	const components = [];
	const introText = ballotIntro(month, year, !intro);

	components.push(new TextDisplayBuilder().setContent(introText));
	components.push(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
	components.push(...buildPostsDisplay(posts));

	if (outro) {
		const voteButton = new ButtonBuilder()
			.setCustomId(`vote:ballot:${ballotId}`)
			.setLabel("Cast Your Votes!")
			.setStyle("Primary")
			.setEmoji("🗳️");

		components.push(new ActionRowBuilder().addComponents(voteButton));
	}

	return components;
}

function chunkArray(array, chunkSize) {
	const chunks = [];
	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}
	return chunks;
}

function getCurrentAndNextMonthIndices() {
	const now = new Date();
	const currentMonthIdx = now.getMonth(); // 0-based
	const nextMonthIdx = (currentMonthIdx + 1) % 12;
	return [currentMonthIdx, nextMonthIdx];
}

function getMonthChoices() {
	const [currentIdx, nextIdx] = getCurrentAndNextMonthIndices();
	const uniqueMonths = [
		MONTHS[nextIdx],
		MONTHS[currentIdx],
		...MONTHS.filter((m, idx) => idx !== currentIdx && idx !== nextIdx),
	];
	return uniqueMonths.map((month) => ({ name: month, value: month }));
}

export const data = new SlashCommandBuilder()
	.setName("create_ballot")
	.setDescription("Creates a ballot for the current month's submissions.")
	.addStringOption((option) =>
		option
			.setName("month")
			.setDescription("The month to look for submissions for.")
			.setRequired(true)
			.addChoices(getMonthChoices()),
	)
	.addIntegerOption((option) =>
		option
			.setName("year")
			.setDescription("The year to look for submissions for.")
			.setRequired(true)
			.addChoices(
				{
					name: String(CURRENT_YEAR),
					value: CURRENT_YEAR,
				},
				{
					name: String(CURRENT_YEAR + 1),
					value: CURRENT_YEAR + 1,
				},
			),
	)
	.addBooleanOption((option) =>
		option
			.setName("force")
			.setDescription(
				"If there is already an existing ballot, overwrite it. Default: false",
			)
			.setRequired(false),
	)
	.addIntegerOption((option) =>
		option
			.setName("ttl")
			.setDescription(
				"Time until the ballot closes and tabulates the results. Default: 24 hours.",
			)
			.setRequired(false)
			.addChoices(
				{ name: "1 minute", value: 1 },
				{ name: "5 minutes", value: 5 },
				{ name: "15 minutes", value: 15 },
				{ name: "30 minutes", value: 30 },
				{ name: "1 hour", value: 60 },
				{ name: "3 hours", value: 60 * 3 },
				{ name: "6 hours", value: 60 * 6 },
				{ name: "12 hours", value: 60 * 12 },
				{ name: "24 hours", value: 60 * 24 },
				{ name: "48 hours", value: 60 * 48 },
			),
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	await interaction.deferReply();

	if (!interaction.guild) {
		return interaction.editReply({
			content: "This command must be used in a server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const channel = await interaction.guild.channels.fetch(SUBMISSIONS_CHANNEL);

	if (!channel) {
		return interaction.editReply({
			content: "Submission channel not found.",
			flags: MessageFlags.Ephemeral,
		});
	} else if (channel.type !== ChannelType.GuildForum) {
		return interaction.editReply({
			content: "Submission channel is not a forum channel.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const ttl =
		interaction.options.getInteger("ttl") * 60 * 1000 || 1000 * 60 * 60 * 24;
	const force = interaction.options.getBoolean("force") || false;

	const month = interaction.options.getString("month", true);
	const year = interaction.options.getInteger("year", true);
	const tagName = `${month} ${year}`;

	const administriviaTag = channel.availableTags.find(
		(tag) => tag.name === "Administrivia",
	);
	const administriviaTagId = administriviaTag ? administriviaTag.id : null;

	const desiredTag = channel.availableTags.find((tag) => tag.name === tagName);
	const desiredTagId = desiredTag ? desiredTag.id : null;
	const ballotId = tagName.toLowerCase().replace(" ", "-");

	if (!force) {
		if (getBallot(ballotId)) {
			return interaction.editReply({
				content: `A ballot for ${tagName} already exists. Use the \`force\` option to overwrite it.`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	if (!desiredTagId) {
		return interaction.editReply({
			content: `No tag found for ${tagName}.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const activeThreads = await channel.threads.fetch();
	const archivedThreads = await channel.threads.fetchArchived();
	const allThreads = activeThreads.threads.concat(archivedThreads.threads);
	const filteredThreads = allThreads.filter(
		(thread) =>
			thread.appliedTags.includes(desiredTagId) &&
			!thread.appliedTags.includes(administriviaTagId),
	);
	const posts = await getPostsFromThreads(filteredThreads);

	if (posts.length === 0) {
		return interaction.editReply({
			content: `No submissions found for ${tagName}.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const maxPostsPerMessage = 8;
	const postChunks = chunkArray(posts, maxPostsPerMessage);

	let replyMessage = await interaction.editReply({
		flags: [MessageFlags.IsComponentsV2],
		components: buildBallotDisplay(
			month,
			year,
			ballotId,
			postChunks[0],
			true,
			postChunks.length === 1,
		),
		allowedMentions: {
			roles: [PARTICIPANT_ROLE_ID],
		},
	});

	for (let i = 1; i < postChunks.length; i++) {
		const isLast = i === postChunks.length - 1;

		replyMessage = await interaction.followUp({
			flags: [MessageFlags.IsComponentsV2],
			components: buildBallotDisplay(
				month,
				year,
				ballotId,
				postChunks[i],
				false,
				isLast,
			),
			allowedMentions: { parse: [] },
		});
	}

	upsertBallotAndDefinePosts(
		ballotId,
		posts,
		replyMessage.id,
		replyMessage.channelId,
		ttl,
	);
}
