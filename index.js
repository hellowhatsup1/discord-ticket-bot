require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 🔧 CONFIGURATION
const TOKEN = process.env.DISCORD_TOKEN; // ✅ pulled from .env / justrunmyapp env vars
const BOT_ID = process.env.BOT_ID;       // optional: set your bot’s user ID in env
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "").split(","); 
// e.g. STAFF_ROLE_IDS=1234567890,9876543210

client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!ticket") || message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    // --- OPEN TICKET ---
    if (command === "open") {
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

            // Add bot itself
            const botMember = message.guild.members.cache.get(BOT_ID);
            if (botMember) {
                permissionOverwrites.push({
                    id: botMember.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                });
            }

            // Add staff roles
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
    if (command === "close") {
        const hasStaffRole = STAFF_ROLE_IDS.some(roleId =>
            message.member.roles.cache.has(roleId)
        );

        if (!hasStaffRole) {
            return message.reply("❌ You don’t have permission to close tickets.");
        }

        if (message.channel.name.startsWith("ticket-")) {
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
});

client.login(TOKEN);
