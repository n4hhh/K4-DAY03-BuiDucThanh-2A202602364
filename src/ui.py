"""MoodMix FastAPI UI with streamed chat, trace events, and playlist state."""

import asyncio
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

sys.path.append(str(Path(__file__).parent))
from mcp_server import MCPAcademicServer
from prompts import MAX_ITERATIONS, REACT_AGENT_SYSTEM_PROMPT
from providers import get_llm_provider

ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
EXPORT_PATH = ROOT_DIR / "docs" / "playlist_export.csv"
SESSIONS = {}

app = FastAPI(title="MoodMix")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def event(payload):
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def visible_text(text):
    return re.sub(r"itunes|apple music", "music catalog", str(text), flags=re.IGNORECASE)


def result_summary(result):
    if result.get("status") != "SUCCESS":
        return visible_text(result.get("message", "The request could not be completed."))
    if "playlist_name" in result:
        return f"Exported {result.get('track_count', 0)} tracks to a CSV file."
    tracks = result.get("tracks", [])
    names = ", ".join(track.get("title", "") for track in tracks[:4])
    return f"Found {len(tracks)} tracks" + (f": {names}." if names else ".")


def new_session():
    return {"history": [], "tracks": [], "playlist_name": "Your queue", "playlists": []}


def settings_from(raw):
    raw = raw if isinstance(raw, dict) else {}
    try:
        temperature = max(0.0, min(1.5, float(raw.get("temperature", 0.3))))
        max_tracks = max(1, min(10, int(raw.get("max_tracks", 10))))
    except (TypeError, ValueError):
        temperature, max_tracks = 0.3, 10
    return {
        "temperature": temperature,
        "max_tracks": max_tracks,
        "response_style": raw.get("response_style") if raw.get("response_style") in {"concise", "balanced", "detailed"} else "balanced",
        "language": raw.get("language") if raw.get("language") in {"auto", "english", "vietnamese"} else "auto",
        "retry_empty": bool(raw.get("retry_empty", True)),
    }


def merge_tracks(existing, incoming):
    tracks = {track["track_id"]: track for track in existing if track.get("track_id")}
    tracks.update({track["track_id"]: track for track in incoming if track.get("track_id")})
    return list(tracks.values())


def history_view(session):
    return [{"id": item["id"], "name": item["name"], "created_at": item["created_at"], "tracks": item["tracks"]} for item in session["playlists"]]


def archive_current(session, name=None):
    if not session["tracks"]:
        return False
    signature = tuple(track.get("track_id") for track in session["tracks"])
    if session["playlists"] and tuple(track.get("track_id") for track in session["playlists"][0]["tracks"]) == signature:
        return False
    session["playlists"].insert(0, {
        "id": str(uuid.uuid4()),
        "name": (name or session["playlist_name"] or "Saved playlist").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tracks": list(session["tracks"]),
    })
    session["playlists"] = session["playlists"][:8]
    return True


def infer_playlist_update(message):
    text = message.lower()
    explicit_playlist = ("playlist", "recommend", "suggest", "top ", "gợi ý", "danh sách")
    if any(term in text for term in explicit_playlist):
        return True
    lookup = ("what is", "who is", "when was", "tell me about", "meaning", "lyrics", "bpm", "genre", "thông tin", "ý nghĩa", "ra mắt", "phát hành")
    if any(term in text for term in lookup):
        return False
    playlist = ("songs", "tracks", "find ", "bài nhạc", "bài hát", "tìm ")
    return any(term in text for term in playlist)


def is_append_request(message):
    text = message.lower()
    return any(term in text for term in ("more like", "add ", "another ", "thêm", "bổ sung", "giống các bài này"))


def proposed_name(message, query):
    match = re.search(r"(?:named|called|tên(?: là)?)\s+['\"]?([^,.!?\n]+)", message, re.IGNORECASE)
    clean_query = re.sub(r"^User:\s*", "", query, flags=re.IGNORECASE)
    return match.group(1).strip(" '\"") if match else (clean_query.strip().title()[:48] or "Generated playlist")


def response_instruction(settings):
    language = {"auto": "Use the language of the latest user message.", "english": "Answer in English.", "vietnamese": "Answer in Vietnamese."}[settings["language"]]
    detail = {"concise": "Be concise.", "balanced": "Use a balanced level of detail.", "detailed": "Give a detailed but readable answer."}[settings["response_style"]]
    return f"{language} {detail} Use every relevant tool result below. Do not claim that returned tracks are missing. Do not call another tool."


async def stream_chat(message, session, settings):
    provider, server = get_llm_provider(), MCPAcademicServer()
    playlist_context = [{key: track.get(key) for key in ("track_id", "title", "artist", "album", "duration_seconds")} for track in session["tracks"]]
    context_parts = session["history"][-6:]
    if playlist_context:
        context_parts.append(f"Current playlist state (do not change it unless requested): {json.dumps(playlist_context, ensure_ascii=False)}")
    context = "\n\n".join(context_parts + [f"User: {message}"])
    system_prompt = REACT_AGENT_SYSTEM_PROMPT
    if not settings["retry_empty"]:
        system_prompt += " Do not retry an empty search; explain the limitation immediately."
    yield event({"type": "status", "content": "Understanding your request"})
    yield event({"type": "trace", "stage": "thought", "content": "Reviewing the music request"})
    final_text, playlist_started, search_attempts = "", False, 0

    try:
        for _ in range(MAX_ITERATIONS):
            decision = provider.generate_with_tools(context, server.list_tools(), system_prompt, settings["temperature"])
            if decision.get("type") != "tool_call":
                break

            tool_name = decision.get("tool_name", "")
            arguments = dict(decision.get("arguments") or {})
            update_playlist = arguments.get("update_playlist")
            if tool_name == "search_tracks":
                search_attempts += 1
                requested_update = infer_playlist_update(message)
                update_playlist = requested_update and (True if update_playlist is None else bool(update_playlist))
                arguments["update_playlist"] = update_playlist
                arguments["limit"] = min(settings["max_tracks"], max(1, int(arguments.get("limit", settings["max_tracks"]))))
            action = "Searching the music catalog" if tool_name == "search_tracks" else "Preparing the playlist export"
            yield event({"type": "trace", "stage": "action", "tool": tool_name, "arguments": arguments, "content": action})
            result = server.call_tool(tool_name, arguments).get("result", {})
            yield event({"type": "trace", "stage": "observation", "content": result_summary(result)})

            if tool_name == "search_tracks":
                tracks = result.get("tracks", []) if result.get("status") == "SUCCESS" else []
                if update_playlist and tracks:
                    if not playlist_started:
                        if session["tracks"] and not is_append_request(message):
                            archive_current(session)
                            session["tracks"] = []
                            yield event({"type": "history", "playlists": history_view(session)})
                        session["playlist_name"] = proposed_name(message, arguments.get("query", ""))
                        playlist_started = True
                    session["tracks"] = merge_tracks(session["tracks"], tracks)
                    yield event({"type": "tracks", "tracks": session["tracks"], "playlist_name": session["playlist_name"]})
                if not tracks and (not settings["retry_empty"] or search_attempts >= 2):
                    context += "\n\nThe music search remained empty. Explain the catalog limitation honestly and do not search again."
                    break
            elif tool_name == "export_playlist" and result.get("status") == "SUCCESS":
                session["playlist_name"] = result.get("playlist_name", session["playlist_name"])
                yield event({"type": "export", "playlist_name": session["playlist_name"], "download_url": "/api/download/playlist_export.csv"})

            context += f"\n\nObservation from {tool_name}: {json.dumps(result, ensure_ascii=False)}"
            if tool_name == "export_playlist" and result.get("status") == "SUCCESS":
                break
        else:
            context += "\n\nThe agent reached its action limit. Give the best grounded answer from the observations."

        yield event({"type": "trace", "stage": "result", "content": "Preparing the response"})
        final_prompt = f"{context}\n\n{response_instruction(settings)}"
        for token in provider.generate_stream(final_prompt, system_prompt, settings["temperature"]):
            token = visible_text(token)
            final_text += token
            yield event({"type": "token", "content": token})
            await asyncio.sleep(0)
        if not final_text:
            final_text = "Your request is complete."
            yield event({"type": "token", "content": final_text})
        session["history"].append(f"User: {message}\nAssistant: {final_text}")
        session["history"] = session["history"][-6:]
        yield event({"type": "done"})
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        yield event({"type": "error", "content": "The agent returned an invalid response. Please try again."})
    except Exception:
        yield event({"type": "error", "content": "Something went wrong while processing your request. Please try again."})


@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/chat/stream")
async def chat(request: Request):
    try:
        body = await request.json()
        message = str(body.get("message", "")).strip()
    except (json.JSONDecodeError, TypeError):
        return JSONResponse({"error": "Invalid request."}, status_code=400)
    if not message:
        return JSONResponse({"error": "A message is required."}, status_code=400)
    session_id = str(body.get("session_id") or uuid.uuid4())
    session = SESSIONS.setdefault(session_id, new_session())
    return StreamingResponse(stream_chat(message, session, settings_from(body.get("settings"))), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/session/{session_id}/save")
async def save_playlist(session_id: str, request: Request):
    session = SESSIONS.get(session_id)
    if not session or not session["tracks"]:
        return JSONResponse({"error": "There is no playlist to save."}, status_code=400)
    body = await request.json()
    archive_current(session, str(body.get("name") or session["playlist_name"]))
    return {"status": "saved", "playlists": history_view(session)}


@app.post("/api/session/{session_id}/restore/{playlist_id}")
def restore_playlist(session_id: str, playlist_id: str):
    session = SESSIONS.get(session_id)
    item = next((item for item in session.get("playlists", []) if item["id"] == playlist_id), None) if session else None
    if not item:
        return JSONResponse({"error": "Saved playlist not found."}, status_code=404)
    archive_current(session)
    session["tracks"], session["playlist_name"] = list(item["tracks"]), item["name"]
    return {"status": "restored", "tracks": session["tracks"], "playlist_name": session["playlist_name"], "playlists": history_view(session)}


@app.get("/api/session/{session_id}/preview/{track_id}")
def preview_track(session_id: str, track_id: str):
    session = SESSIONS.get(session_id, {})
    pools = [session.get("tracks", [])] + [item["tracks"] for item in session.get("playlists", [])]
    track = next((track for pool in pools for track in pool if track.get("track_id") == track_id), None)
    url = track.get("preview_url") if track else None
    if not url or urlparse(url).hostname != "audio-ssl.itunes.apple.com":
        return JSONResponse({"error": "No preview is available for this track."}, status_code=404)
    try:
        upstream = requests.get(url, stream=True, timeout=15)
        upstream.raise_for_status()
    except requests.RequestException:
        return JSONResponse({"error": "The preview could not be loaded."}, status_code=502)

    def chunks():
        try:
            yield from upstream.iter_content(64 * 1024)
        finally:
            upstream.close()

    headers = {"Cache-Control": "private, max-age=900"}
    if upstream.headers.get("Content-Length"):
        headers["Content-Length"] = upstream.headers["Content-Length"]
    media_type = "audio/mp4" if urlparse(url).path.endswith(".m4a") else upstream.headers.get("Content-Type", "audio/mpeg")
    return StreamingResponse(chunks(), media_type=media_type, headers=headers)


@app.delete("/api/session/{session_id}")
def clear_session(session_id: str):
    SESSIONS.pop(session_id, None)
    return {"status": "cleared"}


@app.get("/api/download/playlist_export.csv")
def download_csv():
    if not EXPORT_PATH.exists():
        return JSONResponse({"error": "No playlist export is available yet."}, status_code=404)
    return FileResponse(EXPORT_PATH, media_type="text/csv", filename="playlist_export.csv")


if __name__ == "__main__":
    import uvicorn
    print("MoodMix is running at http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
