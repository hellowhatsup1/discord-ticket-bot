require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_ID = process.env.BOT_ID;
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "").split(",");
const MANAGEMENT_ROLE_IDS = [
  "1455891106926559253",
  "1455891204297195551",
  "1455946597400838287"
];

const channelRestrictions = new Map();
let ticketCounter = 1;
function getNextTicketName() {
  return `ticket-${String(ticketCounter).padStart(3, "0")}`;
}

client.once("ready", () => console.log(`✅ Logged in as ${client.user.tag}`));

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!")) return;
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  // Restrict
  if (command === "!restrict") {
    const hasStaffRole = STAFF_ROLE_IDS.some(r => message.member.roles.cache.has(r));
    if (!hasStaffRole) return message.reply("❌ You don’t have permission to restrict users.");
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Please mention a user.");
    if (!channelRestrictions.has(message.channel.id)) channelRestrictions.set(message.channel.id, new Set());
    channelRestrictions.get(message.channel.id).add(target.id);
    return message.reply(`⛔ ${target} is restricted from using any ticket commands inside this channel!!`);
  }

  // Unrestrict
  if (command === "!unrestrict") {
    const hasStaffRole = STAFF_ROLE_IDS.some(r => message.member.roles.cache.has(r));
    if (!hasStaffRole) return message.reply("❌ You don’t have permission to unrestrict users.");
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Please mention a user.");
    if (target.id === message.author.id) return message.reply("⛔ You cannot unrestrict yourself.");
    if (channelRestrictions.has(message.channel.id)) channelRestrictions.get(message.channel.id).delete(target.id);
    return message.reply(`✅ ${target} is no longer restricted in this channel.`);
  }

  // Block restricted
  if (command.startsWith("!ticket") || command === "!mark") {
    if (channelRestrictions.has(message.channel.id) && channelRestrictions.get(message.channel.id).has(message.author.id)) {
      return message.reply("⛔ You are restricted from using ticket commands in this channel!!");
    }
  }

  // Ticket commands
  if (command === "!ticket") {
    const subCommand = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    // Open
    if (subCommand === "open") {
      try {
        const ticketName = getNextTicketName();
        ticketCounter++;

        const permissionOverwrites = [
          { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: BOT_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        STAFF_ROLE_IDS.forEach(r => {
          const role = message.guild.roles.cache.get(r);
          if (role) permissionOverwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        });

        const ticketChannel = await message.guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          permissionOverwrites
        });

        await ticketChannel.send(`👋 Hello <@${message.author.id}>. Please wait until a management member assists you.\n\n**Reason:** ${reason}`);
        await message.reply(`✅ Your ticket has been opened: ${ticketChannel}`);
      } catch (err) {
        console.error("Error creating ticket:", err);
        message.reply("❌ Failed to create ticket.");
      }
    }

    // Close
    if (subCommand === "close") {
      const hasStaffRole = STAFF_ROLE_IDS.some(r => message.member.roles.cache.has(r));
      if (!hasStaffRole) return message.reply("❌ You don’t have permission to close tickets.");
      if (message.channel.name.startsWith("ticket-") || message.channel.name.startsWith("🌸ticket-")) {
        try {
          // Fetch ALL messages
          let allMessages = [];
          let lastId;
          while (true) {
            const fetched = await message.channel.messages.fetch({ limit: 100, before: lastId });
            if (fetched.size === 0) break;
            allMessages = allMessages.concat(Array.from(fetched.values()));
            lastId = fetched.last().id;
          }
          allMessages.reverse();

          const logs = allMessages
            .map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`)
            .join("\n");

          const logChannel = message.guild.channels.cache.find(ch => ch.name === "ticket-logs");
          if (logChannel) {
            const ticketNumber = message.channel.name.replace("🌸", "");
            await logChannel.send(`**Ticket logs for ${ticketNumber}**`);

            // Split into chunks under 2000 chars
            const chunks = logs.match(/[\s\S]{1,1900}/g) || [];
            for (const chunk of chunks) {
              await logChannel.send(`\`\`\`\n${chunk}\n\`\`\``);
            }
          }

          await message.channel.send(`✅ Ticket closed by <@${message.author.id}>. This channel will be deleted in 3 seconds...`);
          setTimeout(() => message.channel.delete().catch(console.error), 3000);
        } catch (err) {
          console.error("Error closing ticket:", err);
          message.reply("❌ Failed to close the ticket. Check bot permissions and message size.");
        }
      } else {
        message.reply("⚠️ You can only use `!ticket close` inside a ticket channel.");
      }
    }
  }
    // Mark management
  if (command === "!mark" && args[1] === "management") {
    // Restriction check first
    if (channelRestrictions.has(message.channel.id) && channelRestrictions.get(message.channel.id).has(message.author.id)) {
      return message.reply("⛔ You are restricted from using ticket commands in this channel!!");
    }

    if (!message.channel.name.startsWith("ticket-") && !message.channel.name.startsWith("🌸ticket-")) {
      return message.reply("⚠️ You can only use this inside a ticket channel.");
    }

    const ticketCreator = message.guild.members.cache.get(
      message.channel.permissionOverwrites.cache.find(po =>
        po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== message.guild.id && po.id !== BOT_ID
      )?.id
    ) || message.member;

    const botRole = message.guild.members.me.roles.highest;
    const permissionOverwrites = [
      { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: ticketCreator.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: BOT_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];

    message.guild.roles.cache.forEach(role => {
      if (role.position > botRole.position) {
        permissionOverwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }
    });

    const newName = message.channel.name.startsWith("🌸") ? message.channel.name : `🌸${message.channel.name}`;
    await message.channel.edit({
      name: newName,
      topic: "🌸 Only management+ can view and handle this ticket",
      permissionOverwrites
    });

    const isManagement = MANAGEMENT_ROLE_IDS.some(r => message.member.roles.cache.has(r));
    if (isManagement) {
      await message.channel.send(`🌸 This ticket has been marked for management members!!\n\n<@${message.author.id}>`);
    } else {
      try {
        await message.author.send("🌸 The ticket has been successfully marked for management, Thank you for taking the right step!");
      } catch (err) {
        console.error("Failed to DM user:", err);
      }
    }
  }
});

client.login(TOKEN);
