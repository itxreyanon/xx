# HyperWa Userbot 🚀

Advanced WhatsApp Userbot with Telegram Bridge, Smart Command Processing, and Modular Architecture.

## ✨ Features

### 🎯 Core Features
- **Modular Architecture** - Load/unload modules dynamically with hot-reload support
- **QR Code to Telegram** - Automatically sends QR codes to Telegram for easy scanning
- **Smart Command Processing** - Automatic emoji reactions to commands (⏳ → ✅/❌)
- **Telegram Bridge** - Full bidirectional sync between WhatsApp and Telegram
- **Rate Limiting** - Prevent spam and abuse with configurable limits
- **Database Integration** - MongoDB for persistent data storage
- **Contact Syncing** - Sync WhatsApp contacts with Telegram topics
- **Media Support** - Full media sync between platforms
- **Comprehensive Error Handling** - Robust error handling with user feedback

## 🛡️ Security Features

### Rate Limiting
- Maximum commands per minute per user
- Automatic cooldown periods
- Configurable limits per command

### Permission System
- Owner-only commands
- Admin-level permissions
- Public/private mode toggle
- User blocking system

### Input Validation
- Command parameter validation
- File type restrictions
- Domain whitelisting for downloads

## 🎭 Smart Processing Features

### Auto Reactions
Commands automatically get reactions:
- ⏳ When command starts processing
- ✅ When command completes successfully
- ❌ When command fails
- ❓ For unknown commands (if enabled)

### Module System
- **Hot-reload** - Load/unload modules without restarting
- **Custom modules** - Upload .js files to add new functionality
- **System modules** - Core functionality modules
- **Command registration** - Automatic command and alias registration
- **Message hooks** - Pre/post processing hooks for modules

## 🔗 Telegram Bridge Features

### QR Code Sharing
- Automatically sends WhatsApp QR codes to Telegram
- Easy scanning without terminal access
- Supports reconnection QR codes

### Message Syncing
- All WhatsApp messages sync to Telegram topics
- Media files are forwarded
- Contact information is preserved
- Status updates are synced

### Bidirectional Communication
- Send messages from Telegram to WhatsApp
- Reply to WhatsApp messages via Telegram
- Media forwarding in both directions

## 📊 Database Collections

### Bridge Data
```javascript
// Chat mappings
{
    type: 'chat',
    data: {
        whatsappJid: '1234567890@s.whatsapp.net',
        telegramTopicId: 123,
        createdAt: Date,
        lastActivity: Date
    }
}

// User mappings
{
    type: 'user',
    data: {
        whatsappId: '1234567890@s.whatsapp.net',
        name: 'John Doe',
        phone: '1234567890',
        firstSeen: Date,
        messageCount: 42
    }
}

// Contact mappings
{
    type: 'contact',
    data: {
        phone: '1234567890',
        name: 'John Doe',
        updatedAt: Date
    }
}
```

## 🎮 Commands

### Core Commands
- `.ping` - Check bot response time
- `.status` - Show bot status and statistics
- `.help` - Show all available commands
- `.help <module>` - Show detailed module help

### Module Management
- `.lm` - Load module (reply to .js file)
- `.ulm <module>` - Unload module
- `.rlm <module>` - Reload module
- `.modules` - List all loaded modules

### System Commands
- `.restart` - Restart the bot (owner only)
- `.logs` - Send or display bot logs
- `.mode` - Toggle bot mode (public/private)
- `.ban/.unban` - User management
- `.broadcast` - Send message to all chats

## 📦 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd hyperwa
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure the bot**
Create a `.env` file with your settings:
```env
BOT_OWNER=923111111111@s.whatsapp.net
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGO_DB_NAME=HyperWaDB
TG_BOT_TOKEN=1234567890:ABCDEFabcdef
TG_BOT_PASSWORD=1122
TG_CHAT_ID=-1001234567890
ADMINS=923111111111,923222222222
```

4. **Start the bot**
```bash
npm start
```

## ⚙️ Configuration

### Bot Settings
```javascript
bot: {
    name: 'HyperWa',
    company: 'Dawium Technologies',
    prefix: '.',
    version: '2.0.0',
    owner: process.env.BOT_OWNER,
    clearAuthOnStart: false
}
```

### Features Toggle
```javascript
features: {
    mode: 'public', // public or private
    customModules: true,
    rateLimiting: true,
    telegramBridge: true,
    respondToUnknownCommands: false,
    sendPermissionError: false
}
```

### Telegram Bridge
```javascript
telegram: {
    enabled: true,
    botToken: process.env.TG_BOT_TOKEN,
    chatId: process.env.TG_CHAT_ID,
    features: {
        topics: true,
        mediaSync: true,
        profilePicSync: true,
        callLogs: true,
        statusSync: true,
        biDirectional: true
    }
}
```

## 🔧 Creating Modules

### Basic Module Structure
```javascript
class ExampleModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'example';
        this.metadata = {
            description: 'Example module for demonstration',
            version: '1.0.0',
            author: 'Your Name',
            category: 'utility'
        };
        this.commands = [
            {
                name: 'example',
                description: 'Example command',
                usage: '.example <text>',
                permissions: 'public',
                execute: this.exampleCommand.bind(this)
            }
        ];
    }

    async exampleCommand(msg, params, context) {
        try {
            // Your command logic here
            const result = `✅ Example Result: ${params.join(' ')}`;
            
            await context.bot.sendMessage(context.sender, {
                text: result
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Command failed: ${error.message}`
            });
        }
    }

    // Optional: Initialize module
    async init() {
        console.log('Example module initialized');
    }

    // Optional: Cleanup on unload
    async destroy() {
        console.log('Example module destroyed');
    }
}

module.exports = ExampleModule;
```

### Advanced Module Features

#### Database Integration
```javascript
class DatabaseModule {
    constructor(bot) {
        this.bot = bot;
        this.db = null;
        this.collection = null;
    }

    async init() {
        // Get database connection
        this.db = this.bot.db;
        this.collection = this.db.collection('my_module_data');
        
        // Create indexes
        await this.collection.createIndex({ userId: 1 });
    }

    async saveUserData(userId, data) {
        await this.collection.updateOne(
            { userId },
            { $set: { ...data, updatedAt: new Date() } },
            { upsert: true }
        );
    }
}
```

#### Message Hooks
```javascript
class HookModule {
    constructor(bot) {
        this.bot = bot;
        this.messageHooks = {
            'pre_process': this.onPreProcess.bind(this),
            'post_process': this.onPostProcess.bind(this)
        };
    }

    async onPreProcess(msg, text, bot) {
        // Called before command processing
        console.log('Pre-processing message:', text);
    }

    async onPostProcess(msg, text, bot) {
        // Called after command processing
        console.log('Post-processing message:', text);
    }
}
```

#### Command Aliases and Permissions
```javascript
{
    name: 'download',
    description: 'Download media from various platforms',
    usage: '.download <url>',
    aliases: ['dl', 'get'],
    permissions: 'public', // 'public', 'admin', 'owner', or array of user IDs
    execute: this.downloadCommand.bind(this)
}
```

### Module Categories

#### System Modules (Built-in)
- **core** - Basic bot commands (ping, status, help)
- **downloader** - Media downloading from various platforms
- **sticker** - Sticker creation and management
- **groups** - Group management features
- **weather** - Weather information
- **translator** - Text translation
- **fileinfo** - File analysis and information
- **gemini-vision** - AI image/video analysis
- **server** - System monitoring
- **rvo** - View-once media reveal

#### Custom Modules
- Upload .js files via `.lm` command
- Hot-reload without restart
- Full access to bot API
- Database integration support

## 🚀 Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start index.js --name "hyperwa"
pm2 startup
pm2 save
```

### Using Docker
```dockerfile
FROM node:18-alpine
RUN apk add --no-cache git python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
```

## 🔧 Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Check Telegram bot token and chat ID
   - Ensure bot has permission to send photos

2. **Commands not working**
   - Verify prefix in config
   - Check command permissions
   - Review rate limiting settings

3. **Database connection failed**
   - Verify MongoDB URI
   - Check network connectivity
   - Ensure database exists

4. **Telegram bridge not working**
   - Verify bot token and chat ID
   - Check if bot is added to the chat
   - Review Telegram API limits

5. **Module loading failed**
   - Check module syntax and structure
   - Verify all required methods exist
   - Review error logs for details

## 📝 Module Development Guidelines

### Best Practices
1. **Error Handling** - Always wrap command logic in try-catch
2. **User Feedback** - Provide clear success/error messages
3. **Permissions** - Set appropriate permission levels
4. **Documentation** - Include clear descriptions and usage
5. **Resource Cleanup** - Implement destroy() method for cleanup

### Command Structure
```javascript
{
    name: 'commandname',           // Required: Command name
    description: 'Description',    // Required: What the command does
    usage: '.cmd <params>',        // Required: How to use it
    aliases: ['alias1', 'alias2'], // Optional: Alternative names
    permissions: 'public',         // Required: Permission level
    execute: this.method.bind(this) // Required: Function to execute
}
```

### Module Lifecycle
1. **Constructor** - Initialize module properties
2. **init()** - Optional setup (database, external connections)
3. **Command Registration** - Automatic via commands array
4. **Runtime** - Commands execute when called
5. **destroy()** - Optional cleanup when unloading

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Join our Telegram group
- Check the documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

---

**HyperWa Userbot** - Advanced WhatsApp automation with modular architecture! 🚀