# MCP Configuration Guide

## Quick Start

The easiest way to configure MCP servers is using the `mcp-config.json` file.

### 1. Copy the example config:

```bash
cp mcp-config.example.json mcp-config.json
```

### 2. Edit `mcp-config.json`:

Enable the servers you want to use:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\kanis"],
      "disabled": false
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "disabled": false
    }
  }
}
```

### 3. Enable MCP in `.env`:

```env
USE_MCP=true
```

### 4. Restart the app

The app will automatically load the MCP servers from `mcp-config.json`.

---

## Configuration Format

### Basic Structure

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@org/package"],
      "disabled": false,
      "env": {}
    }
  }
}
```

### Fields

- **`command`** (required for stdio): The command to execute (e.g., `npx`, `node`, `python`)
- **`args`** (optional): Array of arguments to pass to the command
- **`url`** (required for http): URL for remote MCP servers (alternative to command/args)
- **`disabled`** (optional): Set to `true` to temporarily disable a server
- **`env`** (optional): Environment variables to pass to the server

---

## Popular MCP Servers

### File System
Allows AI to read, write, and search files on your system.

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
    "disabled": false
  }
}
```

### Sequential Thinking
Helps AI break down complex problems step-by-step.

```json
{
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    "disabled": false
  }
}
```

### Notion
Access Notion databases and pages.

```json
{
  "notion": {
    "command": "npx",
    "args": ["-y", "@makenotion/notion-mcp-server"],
    "disabled": false,
    "env": {
      "NOTION_API_KEY": "your_api_key_here"
    }
  }
}
```

### GitHub
Access GitHub repositories, issues, and pull requests.

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "disabled": false,
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
    }
  }
}
```

---

## Using the UI Toggle

Once MCP servers are configured:

1. Open the chat interface (`/chat` or `@ai`)
2. Look for the **🔌 MCP** toggle button in the header
3. Click to enable/disable MCP
4. When enabled, AI can use tools from connected MCP servers

---

## Troubleshooting

### Servers not loading?

1. Check that `USE_MCP=true` in `.env`
2. Verify `mcp-config.json` is in the project root
3. Check the console for error messages
4. Ensure `disabled: false` for servers you want to use

### Server fails to connect?

1. Check that the package is installed (npx will install automatically)
2. Verify the command and args are correct
3. Check if the server requires API keys in the `env` section
4. Look for error messages in the console

### How to disable a server temporarily?

Set `"disabled": true` instead of removing it:

```json
{
  "notion": {
    "command": "npx",
    "args": ["-y", "@makenotion/notion-mcp-server"],
    "disabled": true
  }
}
```

---

## Alternative: Environment Variables

If you prefer not to use a JSON file, you can configure MCP servers via environment variables:

```env
USE_MCP=true
MCP_SERVERS=[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}]
```

However, the JSON config file is **recommended** because:
- ✅ Easier to read and edit
- ✅ Supports comments (in .example.json)
- ✅ Standard format used by other MCP clients
- ✅ Better for version control

---

## Finding MCP Servers

Discover more MCP servers:
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP Server Registry](https://mcprun.com/)
- [Smithery MCP Servers](https://smithery.ai/)

---

## Security Notes

⚠️ **Important Security Considerations:**

1. **File System Access**: Be careful which directories you expose to MCP servers
2. **API Keys**: Store API keys in `env` section, never commit them to git
3. **Review Servers**: Only use MCP servers from trusted sources
4. **Disable When Not Needed**: Use the UI toggle to disable MCP when not in use
