# 📊 BÁO CÁO THU HOẠCH NGHIỆM THU BÀI LAB 3 (BƯỚC 3 — SUBMISSION ARTIFACT)

> **Họ và Tên Học viên:** [Bùi Đức Thành]  
> **Mã Sinh Viên / Mã Học viên:** [2A202602364]  
> **Chủ đề Lựa chọn:** [MoodMix – Music Discovery and Playlist Export Agent]  

---

## 1. BẢNG CHẤM ĐIỂM AGENTIC FIT SCORING MATRIX (ĐÁNH GIÁ CHỦ ĐỀ)

| Tiêu chí Đánh giá | Mức độ (1 - 5) | Giải trình chi tiết lý do chọn điểm |
| :--- | :---: | :--- |
| **1. Multi-step Reasoning** | 4 / 5 | Bài toán có yêu cầu chia nhỏ nhiều bước suy luận nối tiếp nhau không? |
| **2. Tool Interaction** | 5 / 5 | Hệ thống có cần kết nối với MCP Server / Cơ sở dữ liệu bên ngoài không? |
| **3. Dynamic Decision** | 4 / 5 | Bước tiếp theo có phụ thuộc vào kết quả quan sát bước trước không? |
| **4. Long Horizon Goal** | 3 / 5 | Hệ thống có phải giữ mục tiêu xuyên suốt qua nhiều lượt xử lý không? |
| **TỔNG ĐIỂM AGENTIC FIT** | **16/ 20** | *Nếu tổng điểm > 12/20: Bài toán rất phù hợp triển khai Agentic System.* |

---

## 2. TRÍCH XUẤT KẾT QUẢ WATERFALL TRACE LOG (SAU KHI CHẠY TEST SUITE TRÊN API THẬT)

> ⚠️ **YÊU CẦU NGHIỆM THU:** Mở tệp `.env` điền `GEMINI_API_KEY` (hoặc `OPENAI_API_KEY`) để kết nối LLM thật trước khi thực thi `python src/app.py --all`. Bài nộp chỉ dùng Mock Offline Provider sẽ không đạt điểm nghiệm thực tế.

Dán 1 đoạn trích xuất log tiêu biểu từ file `docs/trace_waterfall.json` sinh ra từ phản hồi LLM API thật:

```json
  {
    "step": 1,
    "query": "Find 5 songs by Linkin Park.",
    "action_type": "TOOL_EXECUTION",
    "tool_name": "search_tracks",
    "arguments": {
      "query": "Linkin Park",
      "limit": 5,
      "update_playlist": true
    },
    "observation": {
      "status": "SUCCESS",
      "query": "Linkin Park",
      "track_count": 5,
      "tracks": [
        {
          "track_id": "6794462262",
          "title": "Faint - Unshatter Film Soundtrack (Live in São Paulo)",
          "artist": "LINKIN PARK",
          "album": "Unshatter Film Soundtrack (Live in São Paulo)",
          "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cd/7b/91/cd7b9189-5c62-5f99-c39a-e268a31ec7c2/093624821380.jpg/100x100bb.jpg",
          "preview_url": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6d/99/08/6d9908e5-41e7-7254-80eb-9159b8f9a4ec/mzaf_10764283628695316964.plus.aac.p.m4a",
          "track_url": "https://music.apple.com/vn/album/faint-unshatter-film-soundtrack-live-in-s%C3%A3o-paulo/6794460856?i=6794462262&uo=4",
          "duration_seconds": 272
        },
        {
          "track_id": "528437613",
          "title": "In the End",
          "artist": "LINKIN PARK",
          "album": "Hybrid Theory",
          "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Features115/v4/f0/31/b2/f031b2b2-bcf0-6102-426f-e0b2c7437415/dj.vrgpwamf.jpg/100x100bb.jpg",
          "preview_url": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/0c/ad/c0/0cadc05e-846a-b090-c7e9-6017df2e0ab5/mzaf_1775739195432502696.plus.aac.p.m4a",
          "track_url": "https://music.apple.com/vn/album/in-the-end/528436018?i=528437613&uo=4",
          "duration_seconds": 216
        },
        {
          "track_id": "528437514",
          "title": "Numb",
          "artist": "LINKIN PARK",
          "album": "Meteora",
          "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Features125/v4/dd/7d/72/dd7d7259-d27f-5b3e-ce64-9e304d2cb40f/dj.rxzrauer.jpg/100x100bb.jpg",
          "preview_url": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/93/dc/45/93dc455c-483f-8931-ef2e-cec30e2ed4bb/mzaf_3013383482601094146.plus.aac.p.m4a",
          "track_url": "https://music.apple.com/vn/album/numb/528435845?i=528437514&uo=4",
          "duration_seconds": 188
        },
        {
          "track_id": "852203669",
          "title": "New Divide",
          "artist": "LINKIN PARK",
          "album": "New Divide - EP",
          "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/13/6a/14/136a1432-1467-01d8-e68c-f4eed839d23e/093624937609.jpg/100x100bb.jpg",
          "preview_url": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/97/fc/ab/97fcab70-c1e5-4009-01ff-89ed1e6e8ced/mzaf_3627835165052872994.plus.aac.p.m4a",
          "track_url": "https://music.apple.com/vn/album/new-divide/852203658?i=852203669&uo=4",
          "duration_seconds": 269
        },
        {
          "track_id": "528975368",
          "title": "What I've Done",
          "artist": "LINKIN PARK",
          "album": "Minutes to Midnight",
          "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Features124/v4/f5/d6/68/f5d6681a-734c-8225-aa28-418c3715b6da/dj.xkwgleci.jpg/100x100bb.jpg",
          "preview_url": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7b/f5/40/7bf5405d-0ca7-5836-ed23-1d00dc913ffb/mzaf_2572396913453041244.plus.aac.p.m4a",
          "track_url": "https://music.apple.com/vn/album/what-ive-done/528975362?i=528975368&uo=4",
          "duration_seconds": 205
        }
      ]
    },
    "latency_ms": 1660.96
  },
  {
    "step": 2,
    "query": "Find 5 songs by Linkin Park.",
    "action_type": "FINAL_ANSWER",
    "thought": "LLM responded directly.",
    "output": "Here are 5 songs by Linkin Park:\n\n1. **Faint** – *Unshatter Film Soundtrack (Live in São Paulo)* — 4:32\n2. **In the End** – *Hybrid Theory* — 3:36\n3. **Numb** – *Meteora* — 3:08\n4. **New Divide** – *New Divide - EP* — 4:29\n5. **What I've Done** – *Minutes to Midnight* — 3:25\n\nLet me know if you'd like these exported as a playlist or want more tracks from a specific album or era.",
    "latency_ms": 1215.01
  },
```

---

## 3. TỔNG KẾT KẾT QUẢ NGHIỆM THU & NỘP BÀI

- [x] Đã điền API Key thật trong `.env` và xác nhận Agent chạy mượt mà trên LLM API thật (Gemini/OpenAI).
- **Tổng số Test Cases đã chạy thành công:** _5_ / 5 test cases.
- **Số lượt gọi Tool qua MCP Server chính xác:** _5_ lượt.
- **Kết quả đẩy Repo nộp bài:** [x] Đã Commit và Push mã nguồn thành công lên GitHub cá nhân.

---

> ✅ **HOÀN TẤT NỘP BÀI:** Sao chép đường link GitHub Repository cá nhân của bạn và dán vào ô nộp bài trên hệ thống LMS VLearn để hoàn tất Bài Lab 3!
