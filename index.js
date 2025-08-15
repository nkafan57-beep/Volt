
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, REST, Routes } = require('discord.js');
const http = require('http');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// أوامر السلاش
const commands = [
    new SlashCommandBuilder()
        .setName('ارسال')
        .setDescription('إرسال رسالة لعدد محدد من الأعضاء في السيرفر')
        .addIntegerOption(option =>
            option.setName('العدد')
                .setDescription('عدد الأعضاء المراد إرسال الرسالة لهم')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('الرسالة')
                .setDescription('الرسالة المراد إرسالها')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('تضمين_البوتات')
                .setDescription('هل تريد تضمين البوتات في الإرسال؟')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('رتبة_محددة')
                .setDescription('إرسال للأعضاء الذين لديهم رتبة محددة فقط')
                .setRequired(false))
];

client.once('ready', async () => {
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);
    
    // تسجيل الأوامر
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    try {
        console.log('بدء تحديث أوامر السلاش...');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('تم تحديث أوامر السلاش بنجاح!');
    } catch (error) {
        console.error('خطأ في تحديث الأوامر:', error);
    }

    // إعداد حالة البوت
    client.user.setPresence({
        activities: [{
            name: 'Message Sender Bot',
            type: 0 // PLAYING
        }],
        status: 'online'
    });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ارسال') {
        // التحقق من صلاحيات الإدارة
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ 
                content: '❌ ليس لديك صلاحية لاستخدام هذا الأمر! يجب أن تكون لديك صلاحية إدارة الخادم.', 
                ephemeral: true 
            });
        }

        const count = interaction.options.getInteger('العدد');
        const message = interaction.options.getString('الرسالة');
        const includeBots = interaction.options.getBoolean('تضمين_البوتات') || false;
        const specificRole = interaction.options.getRole('رتبة_محددة');

        await interaction.deferReply({ ephemeral: true });

        try {
            // جلب جميع الأعضاء
            await interaction.guild.members.fetch();
            
            let members = Array.from(interaction.guild.members.cache.values());
            
            // تصفية البوتات إذا لم يتم تضمينها
            if (!includeBots) {
                members = members.filter(member => !member.user.bot);
            }
            
            // تصفية الأعضاء حسب الرتبة المحددة
            if (specificRole) {
                members = members.filter(member => member.roles.cache.has(specificRole.id));
            }
            
            // خلط الأعضاء عشوائياً واختيار العدد المطلوب
            const shuffledMembers = members.sort(() => Math.random() - 0.5);
            const selectedMembers = shuffledMembers.slice(0, Math.min(count, members.length));

            if (selectedMembers.length === 0) {
                return interaction.editReply({
                    content: '❌ لا توجد أعضاء متاحين للإرسال إليهم بناءً على المعايير المحددة.'
                });
            }

            // إرسال الرسائل
            let successCount = 0;
            let failCount = 0;
            const failedUsers = [];

            for (const member of selectedMembers) {
                try {
                    await member.send(message);
                    successCount++;
                    
                    // تأخير صغير لتجنب rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    failCount++;
                    failedUsers.push(member.user.tag);
                    console.error(`فشل في إرسال رسالة إلى ${member.user.tag}:`, error.message);
                }
            }

            // إنشاء تقرير النتائج
            const embed = new EmbedBuilder()
                .setTitle('📨 تقرير إرسال الرسائل')
                .setColor(successCount > failCount ? 0x00FF00 : 0xFF0000)
                .addFields(
                    { name: '✅ تم الإرسال بنجاح', value: `${successCount} عضو`, inline: true },
                    { name: '❌ فشل الإرسال', value: `${failCount} عضو`, inline: true },
                    { name: '📊 المجموع', value: `${selectedMembers.length} عضو`, inline: true }
                )
                .addFields(
                    { name: '💬 الرسالة المرسلة', value: message, inline: false }
                )
                .setTimestamp();

            if (specificRole) {
                embed.addFields(
                    { name: '🎭 الرتبة المحددة', value: `<@&${specificRole.id}>`, inline: true }
                );
            }

            if (failedUsers.length > 0 && failedUsers.length <= 10) {
                embed.addFields(
                    { name: '⚠️ الأعضاء الذين فشل الإرسال إليهم', value: failedUsers.join('\n'), inline: false }
                );
            } else if (failedUsers.length > 10) {
                embed.addFields(
                    { name: '⚠️ الأعضاء الذين فشل الإرسال إليهم', value: `${failedUsers.slice(0, 5).join('\n')}\n... و ${failedUsers.length - 5} آخرين`, inline: false }
                );
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('خطأ في إرسال الرسائل:', error);
            await interaction.editReply({
                content: '❌ حدث خطأ أثناء إرسال الرسائل. تأكد من أن البوت لديه الصلاحيات اللازمة.'
            });
        }
    }
});

// التعامل مع الأخطاء
client.on('error', console.error);

// تسجيل الدخول
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('يرجى إضافة DISCORD_BOT_TOKEN في Secrets!');
    process.exit(1);
}

// إنشاء HTTP server بسيط للحفاظ على البوت نشطًا
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Message Sender Discord Bot is running!\nبوت إرسال الرسائل يعمل بنجاح!');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
                
