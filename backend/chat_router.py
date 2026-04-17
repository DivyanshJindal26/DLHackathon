"""
FastAPI router for the /chat endpoint.
Proxies to OpenRouter (OpenAI-compatible API) so the API key never reaches the browser.
Handles the full tool-use agentic loop server-side before returning a final response.
"""
import os
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI

router = APIRouter()

# OpenRouter is OpenAI-compatible
_client = AsyncOpenAI(
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    base_url="https://openrouter.ai/api/v1",
    default_headers={
        "HTTP-Referer": os.environ.get("APP_URL", "http://localhost:3000"),
        "X-Title": "LiDAR Fusion Demo",
    },
)

MODEL = "anthropic/claude-sonnet-4-6"


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    scene_context: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    done: bool = True


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    system = req.scene_context.get("system", "") if req.scene_context else ""
    tools = req.scene_context.get("tools") if req.scene_context else None

    messages = req.messages
    if system:
        messages = [{"role": "system", "content": system}] + messages

    # Agentic loop: keep calling until no more tool_calls
    max_rounds = 5
    for _ in range(max_rounds):
        kwargs: dict[str, Any] = {
            "model": MODEL,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.3,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await _client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        msg = choice.message

        if not msg.tool_calls:
            # Final text response
            return ChatResponse(content=msg.content or "", done=True)

        # Return the tool call info to the frontend to execute
        tool_calls_out = [
            {
                "id": tc.id,
                "name": tc.function.name,
                "input": json.loads(tc.function.arguments or "{}"),
            }
            for tc in msg.tool_calls
        ]
        return ChatResponse(
            content=msg.content or "",
            tool_calls=tool_calls_out,
            done=False,
        )

    return ChatResponse(content="Max tool-use rounds reached.", done=True)
