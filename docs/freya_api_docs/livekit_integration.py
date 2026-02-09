import openai as oai
from livekit import openai

headers = {
    "Authorization": "Key <FAL_API_KEY>"
}

oai_stt_client = oai.AsyncClient(
    api_key="stub",
    base_url="<fal stt app url>",
    default_headers=headers,
)

STT = openai.STT(
    client=oai_stt_client,
    model="freya-stt-v1",
)

oai_tts_client = oai.AsyncClient(
    api_key="stub",
    base_url="<fal tts app url>",
    default_headers=headers,
)

TTS = openai.TTS(
    client=oai_tts_client,
    model="freya-tts-v1"
)
