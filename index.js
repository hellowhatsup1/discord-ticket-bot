require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive!"));
app.get("/status", (req, res) => {
  const botStatus = client.user ? `Logged in as ${client.user.tag}` : "Bot not logged in";
  res.json({ status: "ok", bot: botStatus, uptime: process.uptime().toFixed(0) + "s" });
});
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
    if (!hasStaffRole) return message.reply("❌ You don’t have permission.");
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Mention a user.");
    if (!channelRestrictions.has(message.channel.id)) channelRestrictions.set(message.channel.id, new Set());
    channelRestrictions.get(message.channel.id).add(target.id);
    return message.reply(`⛔ ${target.tag} restricted in this channel.`);
  }

  // Unrestrict
  if (command === "!unrestrict") {
    const hasStaffRole = STAFF_ROLE_IDS.some(r => message.member.roles.cache.has(r));
    if (!hasStaffRole) return message.reply("❌ You don’t have permission.");
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Mention a user.");
    if (target.id === message.author.id) return message.reply("⛔ You cannot unrestrict yourself.");
    if (channelRestrictions.has(message.channel.id)) channelRestrictions.get(message.channel.id).delete(target.id);
    return message.reply(`✅ ${target.tag} unrestricted in this channel.`);
  }

  // Block restricted
  if (command.startsWith("!ticket")) {
    if (channelRestrictions.has(message.channel.id) && channelRestrictions.get(message.channel.id).has(message.author.id)) {
      return message.reply("⛔ You are restricted from ticket commands here.");
    }
  }

  // Ticket commands
  if (command === "!ticket") {
    const subCommand = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    // Open
    if (subCommand === "open") {
      try {
        const existingTicket = message.guild.channels.cache.find(ch => ch.name === `ticket-${message.author.username}`);
        if (existingTicket) return message.reply(`⛔ You already have a ticket in ${existingTicket}`);

        const permissionOverwrites = [
          { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        const botMember = message.guild.members.cache.get(BOT_ID);
        if (botMember) permissionOverwrites.push({ id: botMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        STAFF_ROLE_IDS.forEach(r => {
          const role = message.guild.roles.cache.get(r);
          if (role) permissionOverwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        });

        const ticketName = getNextTicketName();
        ticketCounter++;

        const ticketChannel = await message.guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          permissionOverwrites
        });

        await ticketChannel.send(`👋 Hello <@${message.author.id}>. Please wait until a management member assists you.\n\n**Reason:** ${reason}`);
        await message.reply(`✅ Ticket opened: ${ticketChannel}`);
      } catch (err) {
        console.error("Error creating ticket:", err);
        message.reply("❌ Failed to create ticket.");
      }
    }

    // Close
    if (subCommand === "close") {
      const hasStaffRole = STAFF_ROLE_IDS.some(r => message.member.roles.cache.has(r));
      if (!hasStaffRole) return message.reply("❌ You don’t have permission.");
      if (message.channel.name.startsWith("ticket-") || message.channel.name.startsWith("🌸ticket-")) {
        try {
          await message.channel.send(`✅ Ticket closed by <@${message.author.id}>. Deleting in 3s...`);
          setTimeout(() => message.channel.delete().catch(console.error), 3000);
        } catch (err) {
          console.error("Error closing ticket:", err);
          message.reply("❌ Failed to close ticket.");
        }
      } else {
        message.reply("⚠️ Use inside a ticket channel.");
      }
    }
  }

  // Mark management
  if (command === "!mark" && args[1] === "management") {
    if (!message.channel.name.startsWith("ticket-") && !message.channel.name.startsWith("🌸ticket-")) {
      return message.reply("⚠️ Use inside a ticket channel.");
    }

    const ticketCreator = message.guild.members.cache.get(message.channel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== message.guild.id)?.id);

    const botRole = message.guild.members.me.roles.highest;
    const permissionOverwrites = [
      { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: ticketCreator ? ticketCreator.id : message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];
    message.guild.roles.cache.forEach(role => {
      if (role.position > botRole.position) {
        permissionOverwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }
    });

    const newName = message.channel.name.startsWith("🌸") ? message.channel.name : `🌸${message.channel.name}`;
    await message.channel.edit({
      name: newName,
      topic: "Only management+ can view and handle this ticket",
      permissionOverwrites
    });

    const isManagement = MANAGEMENT_ROLE_IDS.some(r => message.member.roles.cache.has(r));
    if (isManagement) {
      await message.channel.send("🌸 The ticket has been marked for management!");
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

