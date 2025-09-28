import {
	SlashCommandBuilder,
	ChannelType,
	MessageFlags,
	TextDisplayBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
} from "discord.js";

import { upsertBallotAndDefinePosts, getBallot } from "../../db/ballots.js";
import { postDisplayText } from "../../utils/templates.js";

const SUBMISSIONS_CHANNEL = process.env.SUBMISSIONS_CHANNEL;

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
		const displayText = postDisplayText(post);

		const title = new TextDisplayBuilder().setContent(displayText);
		const section = new SectionBuilder()
			.addTextDisplayComponents(title)
			.setThumbnailAccessory((thumbnail) => thumbnail.setURL(post.imageUrl));
		const separator = new SeparatorBuilder().setSpacing(
			idx === posts.length - 1
				? SeparatorSpacingSize.Large
				: SeparatorSpacingSize.Small,
		);
		components.push(section, separator);
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
	let introText = `## 🗳️ ${month} ${year} Ballot\n\nIt's time to vote for your favorite icons! Here are all the submissions of this month:\n\n`;

	if (!intro) {
		introText = `## 🗳️ ${month} ${year} Ballot *(cont.)*\n\n`;
	}

	components.push(new TextDisplayBuilder().setContent(introText));

	components.push(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

	components.push(...buildPostsDisplay(posts));

	if (outro) {
		const voteButton = new ButtonBuilder()
			.setCustomId(`vote:ballot:${ballotId}`)
			.setLabel("Vote")
			.setStyle("Success")
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

export const data = new SlashCommandBuilder()
	.setName("create_ballot")
	.setDescription("Creates a ballot for the current month's submissions.")
	.addStringOption((option) =>
		option
			.setName("month")
			.setDescription("The to look for submissions for.")
			.setRequired(true),
	)
	.addIntegerOption((option) =>
		option
			.setName("year")
			.setDescription("The year to look for submissions for.")
			.setRequired(true),
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
				"Time (in minutes) until the ballot closes and tabulates the results. Default: 1440 (24 hours).",
			)
			.setRequired(false),
	);

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
	const filteredThreads = allThreads.filter((thread) =>
		thread.appliedTags.includes(desiredTagId),
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
		allowedMentions: { parse: [] },
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
