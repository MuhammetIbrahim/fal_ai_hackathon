import os
import sys
import httpx
from pathlib import Path


TTS_ENDPOINT = os.environ.get("TTS_ENDPOINT", "")
BASE_URL = f"https://fal.run/{TTS_ENDPOINT}"

if len(TTS_ENDPOINT) == 0:
    print("TTS_ENDPOINT variable'i tanimlanmamis")
    sys.exit(1)

def get_api_key() -> str:
    key = os.getenv("FAL_KEY")
    if not key:
        print("FAL_KEY:", key)
        sys.exit(1)
    return key


def list_models(api_key: str) -> list[dict]:
    url = f"{BASE_URL}/models"
    headers = {"Authorization": f"Key {api_key}"}
    response = httpx.post(url, headers=headers, timeout=30.0)
    response.raise_for_status()
    data = response.json()
    return data.get("data", [])


def generate_speech(
    api_key: str,
    text: str,
    response_format: str = "wav",
    speed: float = 1.0,
    output_path: str | None = None
) -> Path:
    url = f"{BASE_URL}/audio/speech"
    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "input": text,
        "response_format": response_format,
        "speed": speed
    }

    print(f"generating speech for: '{text[:50]}...' ({len(text)} chars)")
    print(f"format: {response_format}, speed: {speed}")

    response = httpx.post(url, headers=headers, json=payload, timeout=120.0)
    response.raise_for_status()

    inference_time = response.headers.get("X-Inference-Time-Ms", "N/A")
    audio_duration = response.headers.get("X-Audio-Duration-Sec", "N/A")

    print(f"inference time: {inference_time}ms")
    print(f"audio duration: {audio_duration}s")

    if output_path is None:
        ext = response_format if response_format != "pcm" else "raw"
        output_path = f"openai_output.{ext}"

    output_file = Path(output_path)
    output_file.write_bytes(response.content)

    print(f"saved to: {output_file} ({len(response.content)} bytes)")
    return output_file


def main():
    api_key = get_api_key()

    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
    else:
        text = "Selam, merhaba!"

    print("=" * 60)
    print("Freya TTS - OpenAI-Compatible Client")
    print("=" * 60)
    print()

    print("fetching available models...")
    try:
        models = list_models(api_key)
        print(f"available models: {[m['id'] for m in models]}")
    except httpx.HTTPStatusError as e:
        print(f"warning: could not fetch models: {e}")
    print()

    print("generating speech...")
    try:
        output_file = generate_speech(
            api_key=api_key,
            text=text,
            response_format="wav",
            speed=1.0
        )
        print()
        print(f"success! audio saved to: {output_file}")
    except httpx.HTTPStatusError as e:
        print(f"error generating speech: {e}")
        print(f"response: {e.response.text}")
        sys.exit(1)


if __name__ == "__main__":
    main()
