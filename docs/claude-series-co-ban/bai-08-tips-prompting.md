# Bài 8: Tips & Prompting Techniques với Claude

> Series: Làm Quen Với Claude AI | Cộng đồng Claude AI VN

## Prompting là gì?

Prompting là cách bạn giao tiếp với AI. Prompt tốt = Kết quả tốt.

```
Prompt = Instructions + Context + Input + Output Format
```

## Nguyên tắc cơ bản

### 1. Rõ ràng và cụ thể

```
❌ Bad: "Viết code"
✅ Good: "Viết function Python tính factorial,
         sử dụng recursion, có docstring và type hints"
```

### 2. Cung cấp context

```
❌ Bad: "Fix bug này"
✅ Good: "Đây là function Python tính trung bình.
         Lỗi: ZeroDivisionError khi list rỗng.
         Code: [paste code]
         Yêu cầu: Handle edge case và return 0"
```

### 3. Chỉ định format output

```
"Trả lời bằng:
- Tiếng Việt
- Format markdown
- Có code examples
- Giải thích ngắn gọn"
```

## Techniques nâng cao

### 1. Role Prompting
```
"Bạn là senior Python developer với 10 năm kinh nghiệm.
Review code này và đề xuất improvements..."
```

### 2. Few-shot Examples
```
"Chuyển câu sang passive voice:
- Active: The cat ate the fish → Passive: The fish was eaten by the cat
- Active: She wrote a letter → Passive: A letter was written by her
- Active: He fixed the bug → Passive: ?"
```

### 3. Chain of Thought
```
"Giải bài toán này step by step:
1. Đọc đề và xác định yêu cầu
2. Liệt kê thông tin đã cho
3. Tìm công thức/phương pháp
4. Giải từng bước
5. Kiểm tra kết quả"
```

### 4. Structured Output
```
"Phân tích startup này và trả về JSON format:
{
  "name": "...",
  "strengths": [...],
  "weaknesses": [...],
  "score": 1-10
}"
```

## Templates hữu ích

### Code Review
```
Review code sau:
[paste code]

Đánh giá các khía cạnh:
1. Code quality
2. Performance
3. Security
4. Best practices

Output format: Markdown với severity levels (Critical/Major/Minor)
```

### Explain Code
```
Giải thích code này cho beginner:
[paste code]

Yêu cầu:
- Giải thích từng phần
- Dùng ví dụ đơn giản
- Highlight các concepts quan trọng
```

### Debug
```
Code: [paste code]
Error: [paste error message]
Expected: [mô tả expected behavior]
Actual: [mô tả actual behavior]

Hãy:
1. Xác định nguyên nhân
2. Đề xuất fix
3. Giải thích tại sao fix này hoạt động
```

### Generate Code
```
Viết [loại code] với requirements:
- Language: [ngôn ngữ]
- Function: [chức năng]
- Input: [input format]
- Output: [output format]
- Edge cases: [các trường hợp đặc biệt]
- Style: [coding style/conventions]
```

## Tips đặc biệt cho Claude

### 1. Claude thích XML tags
```
<context>
Đây là project React e-commerce
</context>

<task>
Tạo component ProductCard
</task>

<requirements>
- TypeScript
- Tailwind CSS
- Responsive
</requirements>
```

### 2. Sử dụng System Prompt (API)
```python
client.messages.create(
    model="claude-sonnet-4-5-20250514",
    system="Bạn là coding assistant. Luôn viết code clean,
            có comments, và follow best practices.",
    messages=[...]
)
```

### 3. Iterative Refinement
```
Lần 1: "Viết function sort"
Lần 2: "Thêm error handling"
Lần 3: "Optimize performance"
Lần 4: "Thêm unit tests"
```

## Những điều nên tránh

| ❌ Tránh | ✅ Nên làm |
|---------|-----------|
| Prompt mơ hồ | Cụ thể, chi tiết |
| Quá nhiều yêu cầu một lúc | Chia nhỏ tasks |
| Không cho context | Cung cấp đủ thông tin |
| Expect perfection lần đầu | Iterative improvement |

## Tổng kết Series

Qua 8 bài, bạn đã học:
1. ✅ Claude là gì và Anthropic
2. ✅ Các phiên bản: Opus, Sonnet, Haiku
3. ✅ Sử dụng Claude.ai
4. ✅ Claude Desktop App
5. ✅ Claude Code cho coding
6. ✅ MCP - kết nối Claude với mọi thứ
7. ✅ Claude API cho developers
8. ✅ Prompting techniques

**Next steps:**
- Thực hành hàng ngày
- Join cộng đồng Claude AI VN
- Chia sẻ kinh nghiệm

---

**Cảm ơn bạn đã theo dõi series!**

#ClaudeAI #Prompting #Tips #VibeCoding #ClaudeAIVN
