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
import db from "../../db.js";

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

function updateDatabase(ballotId, posts) {
	db
		.prepare(
			`
			CREATE TABLE IF NOT EXISTS ballots (
				id TEXT PRIMARY KEY,
				options TEXT
			)
			`,
		)
		.run();

	for (const post of posts) {
		db
			.prepare(
				`
				CREATE TABLE IF NOT EXISTS votes (
					ballot_id TEXT,
					post_id INTEGER,
					points INTEGER DEFAULT 0,
					PRIMARY KEY (ballot_id, post_id),
					FOREIGN KEY (ballot_id) REFERENCES ballots(id)
				)
				`,
			)
			.run();

		db
			.prepare(
				`
				INSERT OR IGNORE INTO votes (ballot_id, post_id, points)
				VALUES (?, ?, 0)
				`,
			)
			.run(ballotId, post.id);
	}

	db
		.prepare(
			`
			INSERT OR REPLACE INTO ballots (id, options)
			VALUES (?, ?)
			`,
		)
		.run(ballotId, JSON.stringify(posts));
}

function buildPostsDisplay(posts) {
	const components = [];
	posts.forEach((post, idx) => {
		const title = new TextDisplayBuilder().setContent(
			`### ${post.id}. **${post.title}**`,
		);
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

function buildBallotDisplay(month, year, ballotId, posts) {
	const components = [];

	components.push(
		new TextDisplayBuilder().setContent(
			`## 🗳️ ${month} ${year} Ballot\n\nIt's time to vote for your favorite icons! Here are all the submissions of this month:\n\n`,
		),
	);

	components.push(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

	components.push(...buildPostsDisplay(posts));

	const voteButton = new ButtonBuilder()
		.setCustomId(`vote:${ballotId}`)
		.setLabel("Vote")
		.setStyle("Success")
		.setEmoji("🗳️");

	components.push(new ActionRowBuilder().addComponents(voteButton));

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
	const ballotId = tagName.toLowerCase().replace(" ", "-");

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

	updateDatabase(ballotId, posts);

	await interaction.reply({
		flags: [MessageFlags.IsComponentsV2],
		components: buildBallotDisplay(month, year, ballotId, posts),
		allowedMentions: { parse: [] },
	});
}
