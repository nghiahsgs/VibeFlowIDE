# Bài 5: Claude Code - Công cụ coding bằng AI

> Series: Làm Quen Với Claude AI | Cộng đồng Claude AI VN

## Claude Code là gì?

Claude Code là **agentic coding tool** chạy trong terminal, giúp bạn:
- Viết code bằng ngôn ngữ tự nhiên
- Đọc, sửa, tạo files tự động
- Chạy commands
- Debug và fix bugs

```
"Turn ideas into code faster than ever before"
```

## Yêu cầu

- **Account:** Claude Pro, Max, Teams, hoặc Enterprise
- **Hoặc:** Claude Console account (API)
- **OS:** macOS, Linux, Windows (WSL)

## Cài đặt

### macOS / Linux / WSL
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

### Windows PowerShell
```powershell
irm https://claude.ai/install.ps1 | iex
```

### Homebrew (macOS)
```bash
brew install claude-code
```

## Sử dụng cơ bản

### Khởi động
```bash
cd your-project
claude
```

### Ví dụ commands

```bash
# Hỏi về codebase
> "Giải thích cấu trúc project này"

# Tạo file mới
> "Tạo component React Button với TypeScript"

# Fix bug
> "Fix lỗi trong file src/utils.ts dòng 42"

# Refactor
> "Refactor function này cho clean hơn"

# Run tests
> "Chạy tests và fix nếu fail"
```

## Tính năng nổi bật

### 1. Agentic Workflow
Claude Code tự động:
- Đọc files cần thiết
- Phân tích codebase
- Đề xuất và thực hiện changes
- Chạy commands

### 2. Context Awareness
- Hiểu toàn bộ project
- Đọc được nhiều files
- Nhớ history trong session

### 3. Safe by Default
- Hỏi confirm trước khi sửa
- Có thể undo
- Không chạy dangerous commands tự động

## IDE Integration

Claude Code tích hợp với:
- **VS Code** - Extension chính thức
- **JetBrains** - IntelliJ, WebStorm, PyCharm...
- **Vim/Neovim** - Plugin

## So sánh với GitHub Copilot

| Tiêu chí | Claude Code | GitHub Copilot |
|----------|-------------|----------------|
| Cách hoạt động | Agentic, full context | Autocomplete |
| Scope | Toàn project | File hiện tại |
| Can modify | ✅ Nhiều files | ❌ Gợi ý only |
| Can run commands | ✅ | ❌ |
| Pricing | Theo Claude plan | $10-19/tháng |

## Tips

1. **Prompt rõ ràng** - Càng chi tiết càng tốt
2. **Review changes** - Luôn check trước khi apply
3. **Use in project root** - Để Claude thấy toàn bộ code
4. **Iterative** - Có thể yêu cầu sửa tiếp

## Ví dụ thực tế

```bash
> "Tạo API endpoint GET /users với Express,
   có validation, error handling,
   và viết tests"
```

Claude Code sẽ:
1. Tạo file route
2. Thêm validation
3. Handle errors
4. Tạo test file
5. Hỏi bạn confirm

---

**Bài tiếp theo:** MCP là gì? Kết nối Claude với mọi thứ

#ClaudeAI #ClaudeCode #Coding #VibeCoding
