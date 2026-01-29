# Bài 6: MCP là gì? Kết nối Claude với mọi thứ

> Series: Làm Quen Với Claude AI | Cộng đồng Claude AI VN

## MCP là gì?

**MCP (Model Context Protocol)** là open-source standard do Anthropic phát triển, cho phép AI applications kết nối với external systems.

```
Hãy nghĩ MCP như USB-C cho AI:
- USB-C kết nối thiết bị với phụ kiện
- MCP kết nối AI với data sources & tools
```

## Kiến trúc MCP

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│   AI Apps       │     │    MCP      │     │  External       │
│                 │────▶│  Protocol   │────▶│  Systems        │
│ - Claude        │     │             │     │                 │
│ - Claude Code   │◀────│ Bidirectional◀────│ - Files         │
│ - Other AI      │     │  Data Flow  │     │ - Databases     │
│                 │     │             │     │ - APIs          │
└─────────────────┘     └─────────────┘     │ - Tools         │
                                            └─────────────────┘
```

## MCP có thể làm gì?

### 1. Data Sources
- Local files & folders
- Databases (PostgreSQL, SQLite, MongoDB)
- Cloud storage (Google Drive, Dropbox)

### 2. Tools
- Search engines
- Calculators
- Git operations
- Browser automation

### 3. Workflows
- Specialized prompts
- Custom actions
- Automation scripts

## Ví dụ thực tế

### Kết nối với Local Files
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/folder"]
    }
  }
}
```

→ Claude có thể đọc/ghi files trong folder đó

### Kết nối với Database
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres", "postgresql://..."]
    }
  }
}
```

→ Claude có thể query database

## Cách setup MCP

### Với Claude Desktop

1. Mở file config:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Thêm MCP servers:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"]
    }
  }
}
```

3. Restart Claude Desktop

### Với Claude Code
```bash
claude mcp add server-name command args
```

## MCP Servers phổ biến

| Server | Chức năng |
|--------|-----------|
| `filesystem` | Đọc/ghi local files |
| `postgres` | Query PostgreSQL |
| `sqlite` | Query SQLite |
| `git` | Git operations |
| `github` | GitHub API |
| `slack` | Slack integration |
| `google-drive` | Google Drive access |

## Tại sao MCP quan trọng?

1. **Standardization** - Một protocol cho mọi AI
2. **Security** - Kiểm soát quyền truy cập
3. **Extensibility** - Dễ dàng thêm integrations
4. **Open Source** - Community-driven

## Resources

- **Docs:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **GitHub:** [github.com/modelcontextprotocol](https://github.com/modelcontextprotocol)
- **Registry:** Danh sách MCP servers có sẵn

---

**Bài tiếp theo:** Claude API cho Developer

#ClaudeAI #MCP #ModelContextProtocol #VibeCoding
