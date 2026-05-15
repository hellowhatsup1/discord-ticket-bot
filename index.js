require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");

// --- Minimal Express server for Render/UptimeRobot ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

app.get("/status", (req, res) => {
  const botStatus = client.user 
    ? `Logged in as ${client.user.tag}` 
    : "Bot not logged in";

  res.json({
    status: "ok",
    bot: botStatus,
    uptime: process.uptime().toFixed(0) + "s"
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// --- Discord Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔧 CONFIGURATION
const TOKEN = process.env.DISCORD_TOKEN;
const BOT_ID = process.env.BOT_ID;
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "").split(",");

// Management roles (hardcoded from your IDs)
const MANAGEMENT_ROLE_IDS = [
  "1455891106926559253",
  "1455891204297195551",
  "1455946597400838287"
];

// Map of channelId -> Set of restricted user IDs
const channelRestrictions = new Map();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  // --- Restrict Command ---
  if (command === "!restrict") {
    const hasStaffRole = STAFF_ROLE_IDS.some(roleId =>
      message.member.roles.cache.has(roleId)
    );
    if (!hasStaffRole) return message.reply("❌ You don’t have permission to restrict users.");

    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Please mention a user to restrict.");

    if (!channelRestrictions.has(message.channel.id)) {
      channelRestrictions.set(message.channel.id, new Set());
    }
    channelRestrictions.get(message.channel.id).add(target.id);

    return message.reply(`⛔ ${target.tag} is now restricted from ticket commands in this channel.`);
  }

  // --- Unrestrict Command ---
  if (command === "!unrestrict") {
    const hasStaffRole = STAFF_ROLE_IDS.some(roleId =>
      message.member.roles.cache.has(roleId)
    );
    if (!hasStaffRole) return message.reply("❌ You don’t have permission to unrestrict users.");

    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Please mention a user to unrestrict.");

    // Prevent self-unrestrict
    if (target.id === message.author.id) {
      return message.reply("⛔ You cannot unrestrict yourself. Another staff member must do it.");
    }

    if (channelRestrictions.has(message.channel.id)) {
      channelRestrictions.get(message.channel.id).delete(target.id);
    }

    return message.reply(`✅ ${target.tag} is no longer restricted in this channel.`);
  }

  // --- Block restricted users from ticket commands ---
  if (command.startsWith("!ticket")) {
    if (channelRestrictions.has(message.channel.id) &&
        channelRestrictions.get(message.channel.id).has(message.author.id)) {
      return message.reply("⛔ You are restricted from using ticket commands in this channel.");
    }
  }

  // --- Ticket Commands ---
  if (command === "!ticket") {
    const subCommand = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    // --- OPEN TICKET ---
    if (subCommand === "open") {
      try {
        const existingTicket = message.guild.channels.cache.find(
          ch => ch.name === `ticket-${message.author.username}`
        );

        if (existingTicket) {
          return message.reply(`⛔ You already have a ticket in ${existingTicket}`);
        }

        const permissionOverwrites = [
          {
            id: message.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: message.author.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          }
        ];

        const botMember = message.guild.members.cache.get(BOT_ID);
        if (botMember) {
          permissionOverwrites.push({
            id: botMember.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          });
        }

        STAFF_ROLE_IDS.forEach(roleId => {
          const role = message.guild.roles.cache.get(roleId);
          if (role) {
            permissionOverwrites.push({
              id: role.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            });
          }
        });

        const ticketChannel = await message.guild.channels.create({
          name: `ticket-${message.author.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: permissionOverwrites,
        });

        await ticketChannel.send(
          `👋 Hello <@${message.author.id}>. Please wait until a management member comes to assist you.\n\n**Reason:** ${reason}`
        );

        await message.reply(`✅ Your ticket has been opened: ${ticketChannel}`);
      } catch (err) {
        console.error("Error creating ticket:", err);
        message.reply("❌ Failed to create ticket channel.");
      }
    }

    // --- CLOSE TICKET ---
    if (subCommand === "close") {
      const hasStaffRole = STAFF_ROLE_IDS.some(roleId =>
        message.member.roles.cache.has(roleId)
      );

      if (!hasStaffRole) {
        return message.reply("❌ You don’t have permission to close tickets.");
      }

      if (message.channel.name.startsWith("ticket-") || message.channel.name.startsWith("🌸ticket-")) {
        try {
          await message.channel.send(`✅ Ticket closed by <@${message.author.id}>. This channel will be deleted in 3 seconds...`);
          setTimeout(() => {
            message.channel.delete().catch(console.error);
          }, 3000);
        } catch (err) {
          console.error("Error closing ticket:", err);
          message.reply("❌ Failed to close the ticket.");
        }
      } else {
        message.reply("⚠️ You can only use `!ticket close` inside a ticket channel.");
      }
    }
  }

  // --- MARK MANAGEMENT COMMAND ---
  if (command === "!mark" && args[1] === "management") {
    if (!message.channel.name.startsWith("ticket-") && !message.channel.name.startsWith("🌸ticket-")) {
      return message.reply("⚠️ You can only use this command inside a ticket channel.");
    }

    // Find ticket creator (based on channel name)
    const ticketCreatorName = message.channel.name.replace("ticket-", "").replace("🌸ticket-", "");
    const ticketCreator = message.guild.members.cache.find(m => m.user.username === ticketCreatorName);

    // Build new permission overwrites
    const permissionOverwrites = [
      {
        id: message.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: ticketCreator ? ticketCreator.id : message.author.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      }
    ];

    MANAGEMENT_ROLE_IDS.forEach(roleId => {
      const role = message.guild.roles.cache.get(roleId);
      if (role) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }
    });

    await message.channel.edit({
      name: `🌸ticket-${ticketCreator ? ticketCreator.user.username : message.author.username}`,
      permissionOverwrites: permissionOverwrites
    });

    await message.channel.send("🔒 Only management members can see and chat in this ticket.");

    // Check if the person is in management
    const isManagement = MANAGEMENT_ROLE_IDS.some(roleId =>
      message.member.roles.cache.has(roleId)
    );

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


