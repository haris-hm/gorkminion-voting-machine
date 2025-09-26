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
import dotenv from "dotenv";

dotenv.config();
const SUBMISSIONS_CHANNEL = process.env.SUBMISSIONS_CHANNEL;

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
	);

async function getPostsFromThreads(threads) {
	const posts = [];

	for (const thread of threads.values()) {
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
		const title = new TextDisplayBuilder().setContent(`### **${post.title}**`);
		const description = new TextDisplayBuilder().setContent(
			`**Created by <@${post.author}>**\n*Original Post: ${post.threadUrl}*`,
		);
		const section = new SectionBuilder()
			.addTextDisplayComponents(title, description)
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

export async function execute(interaction) {
	if (!interaction.guild) {
		return interaction.reply({
			content: "This command must be used in a server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const channel = await interaction.guild.channels.fetch(SUBMISSIONS_CHANNEL);

	if (!channel) {
		return interaction.reply({
			content: "Submission channel not found.",
			flags: MessageFlags.Ephemeral,
		});
	} else if (channel.type !== ChannelType.GuildForum) {
		return interaction.reply({
			content: "Submission channel is not a forum channel.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const month = interaction.options.getString("month", true);
	const year = interaction.options.getInteger("year", true);
	const tagName = `${month} ${year}`;

	const desiredTag = channel.availableTags.find((tag) => tag.name === tagName);
	const desiredTagId = desiredTag ? desiredTag.id : null;

	if (!desiredTagId) {
		return interaction.reply({
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

	const ballotDescription = new TextDisplayBuilder().setContent(
		`## 🗳️ ${month} ${year} Ballot\n\nIt's time to vote for your favorite icons! Here are all the submissions of this month:\n\n`,
	);
	const separator = new SeparatorBuilder().setSpacing(
		SeparatorSpacingSize.Large,
	);
	const postsDisplay = buildPostsDisplay(posts);
	const voteButton = new ButtonBuilder()
		.setCustomId("vote")
		.setLabel("Vote")
		.setStyle("Success")
		.setEmoji("🗳️");

	const row = new ActionRowBuilder().addComponents(voteButton);

	await interaction.reply({
		flags: [MessageFlags.IsComponentsV2],
		components: [ballotDescription, separator, ...postsDisplay, row],
		allowedMentions: { parse: [] },
	});
}
