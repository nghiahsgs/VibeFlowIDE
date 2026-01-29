# Bài 7: Claude API cho Developer

> Series: Làm Quen Với Claude AI | Cộng đồng Claude AI VN

## Claude API là gì?

Claude API cho phép developers tích hợp Claude vào applications của mình:
- Chatbots
- Content generation
- Code assistants
- Data analysis
- Và nhiều hơn nữa...

## Bắt đầu

### 1. Tạo account
1. Truy cập [console.anthropic.com](https://console.anthropic.com)
2. Đăng ký account
3. Add payment method

### 2. Lấy API Key
1. Vào Settings → API Keys
2. Click "Create Key"
3. Copy và lưu key an toàn

⚠️ **Quan trọng:** Không share API key, không commit vào git!

## Pricing (API)

| Model | Input | Output |
|-------|-------|--------|
| Opus 4.5 | $5/MTok | $25/MTok |
| Sonnet 4.5 | $3/MTok | $15/MTok |
| Haiku 4.5 | $1/MTok | $5/MTok |

*MTok = 1 triệu tokens*

**Tip:** Dùng Batch API để tiết kiệm 50%

## Code Examples

### Python

```python
# Cài đặt
# pip install anthropic

import anthropic

client = anthropic.Anthropic(
    api_key="your-api-key"  # hoặc set ANTHROPIC_API_KEY env
)

message = client.messages.create(
    model="claude-sonnet-4-5-20250514",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Xin chào Claude!"}
    ]
)

print(message.content[0].text)
```

### JavaScript/TypeScript

```javascript
// Cài đặt
// npm install @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'your-api-key'
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250514',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Xin chào Claude!' }
  ]
});

console.log(message.content[0].text);
```

### cURL

```bash
curl https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Xin chào Claude!"}
    ]
  }'
```

## Các tính năng API

### 1. Messages API
- Gửi/nhận messages
- Multi-turn conversations
- System prompts

### 2. Streaming
```python
with client.messages.stream(
    model="claude-sonnet-4-5-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

### 3. Vision (Images)
```python
message = client.messages.create(
    model="claude-sonnet-4-5-20250514",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "url", "url": "..."}},
            {"type": "text", "text": "Mô tả hình này"}
        ]
    }]
)
```

### 4. Tool Use (Function Calling)
```python
tools = [{
    "name": "get_weather",
    "description": "Lấy thời tiết",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string"}
        }
    }
}]

message = client.messages.create(
    model="claude-sonnet-4-5-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Thời tiết Hà Nội?"}]
)
```

## Best Practices

1. **Set max_tokens** - Tránh chi phí không kiểm soát
2. **Use system prompt** - Định hướng behavior
3. **Handle errors** - Rate limits, API errors
4. **Cache responses** - Tiết kiệm tokens
5. **Monitor usage** - Theo dõi trong Console

## Resources

- **Docs:** [docs.anthropic.com](https://docs.anthropic.com)
- **SDK Python:** `pip install anthropic`
- **SDK JS:** `npm install @anthropic-ai/sdk`
- **Playground:** [console.anthropic.com/workbench](https://console.anthropic.com/workbench)

---

**Bài tiếp theo:** Tips & Prompting Techniques với Claude

#ClaudeAI #API #Developer #VibeCoding
