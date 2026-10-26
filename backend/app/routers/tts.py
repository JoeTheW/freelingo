import os
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response

from app.core.app_logger import get_logger
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.tts_stt import TTSRequest
from app.services.prompts.common import TUTOR_DISPLAY_NAME

router = APIRouter(prefix="/api", tags=["tts"])
logger = get_logger(__name__)

_PREVIEW_DIR = "/app/tts_previews"
_OPENAI_VOICES = frozenset(
    {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"}
)
_PREVIEW_TEXT = (
    f"Hello! I'm {TUTOR_DISPLAY_NAME}, your tutor. This is how I sound — warm, clear, "
    "and ready to help you practise every day. Let's get started!"
)

# TTS provider values that support client-selectable voices.
# For these providers the client voice param is forwarded; for others it is ignored.
_VOICE_SELECTABLE_PROVIDERS = frozenset({"openai", "piper"})


@router.get("/tts/voices")
@limiter.limit("30/minute")
async def list_voices(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return available voices for the configured TTS provider.

    For piper provider, proxies the piper-docker /voices endpoint.
    For openai provider, returns the hardcoded OpenAI voice list.
    For other providers, returns an empty list.
    """
    tts_service = getattr(request.app.state, "tts_service", None)
    if tts_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TTS service is not enabled",
        )

    # Piper: dynamic voice list from the container
    if settings.TTS_PROVIDER == "piper":
        if hasattr(tts_service, "list_voices"):
            try:
                return await tts_service.list_voices()
            except Exception as exc:
                logger.warning("[tts-voices] Failed to fetch piper voices: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to retrieve voice list from TTS service",
                ) from exc
        return []

    # OpenAI: hardcoded list
    if settings.TTS_PROVIDER == "openai":
        return [
            {"id": v, "name": v, "file": f"{v}.onnx", "language": "en-US", "quality": "high"}
            for v in _OPENAI_VOICES
        ]

    return []


@router.post("/tts")
@limiter.limit("20/minute")
async def text_to_speech(
    request: Request,
    body: TTSRequest,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Proxy TTS request to the configured service. Returns audio bytes."""
    t0 = time.perf_counter()
    trace_id = request.headers.get("X-TTS-Trace-ID") or f"tts-{uuid.uuid4().hex[:12]}"

    tts_service = getattr(request.app.state, "tts_service", None)
    if tts_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TTS service is not enabled",
        )

    synth_t0 = time.perf_counter()
    # Forward client voice only for providers that support selectable voices.
    # Prevents stale voice names (e.g. OpenAI "nova") from reaching Kokoro.
    voice = body.voice if settings.TTS_PROVIDER in _VOICE_SELECTABLE_PROVIDERS else None
    audio = await tts_service.synthesize(body.text, voice)
    synth_ms = (time.perf_counter() - synth_t0) * 1000
    total_ms = (time.perf_counter() - t0) * 1000

    # Determine media type: PiperTTSService exposes a media_type property
    media_type = getattr(tts_service, "media_type", "audio/mpeg")

    logger.info(
        "tts",
        trace=trace_id,
        user_id=current_user.id,
        text_len=len(body.text),
        audio_bytes=len(audio),
        provider=type(tts_service).__name__,
        synth_ms=round(synth_ms, 1),
        total_ms=round(total_ms, 1),
    )

    return Response(
        content=audio,
        media_type=media_type,
        headers={
            "X-TTS-Trace-ID": trace_id,
            "X-TTS-Backend-Synth-Ms": f"{synth_ms:.1f}",
            "X-TTS-Backend-Total-Ms": f"{total_ms:.1f}",
        },
    )


@router.get("/tts/preview/{voice}")
@limiter.limit("60/minute")
async def voice_preview(
    request: Request,
    voice: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Return a cached preview audio clip for the given voice.

    For OpenAI TTS, the MP3 is generated once and persisted to disk so
    subsequent requests are served from cache. For Piper, the preview is
    generated on-the-fly and cached as WAV.
    """
    tts_service = getattr(request.app.state, "tts_service", None)
    if tts_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TTS service is not enabled",
        )

    if settings.TTS_PROVIDER == "openai":
        if voice not in _OPENAI_VOICES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid voice name")

        cache_path = os.path.join(_PREVIEW_DIR, f"{voice}.mp3")

        if not os.path.exists(cache_path):
            os.makedirs(_PREVIEW_DIR, exist_ok=True)
            audio = await tts_service.synthesize(_PREVIEW_TEXT, voice)
            tmp_path = cache_path + ".tmp"
            with open(tmp_path, "wb") as fh:  # noqa: PTH123
                fh.write(audio)
            os.replace(tmp_path, cache_path)
            logger.info("tts_preview_cached", voice=voice, bytes=len(audio))

        return FileResponse(cache_path, media_type="audio/mpeg")

    if settings.TTS_PROVIDER == "piper":
        ext = "wav"
        content_type = "audio/wav"
        cache_path = os.path.join(_PREVIEW_DIR, f"{voice}.{ext}")

        if not os.path.exists(cache_path):
            os.makedirs(_PREVIEW_DIR, exist_ok=True)
            audio = await tts_service.synthesize(_PREVIEW_TEXT, voice)
            tmp_path = cache_path + ".tmp"
            with open(tmp_path, "wb") as fh:  # noqa: PTH123
                fh.write(audio)
            os.replace(tmp_path, cache_path)
            logger.info("tts_preview_cached", provider="piper", voice=voice, bytes=len(audio))

        return FileResponse(cache_path, media_type=content_type)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Voice preview is only available with OpenAI or Piper TTS",
    )
