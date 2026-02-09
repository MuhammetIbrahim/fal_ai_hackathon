import os
import sys
import time
import argparse
from pathlib import Path
import httpx
import fal_client


BASE_URL = "https://fal.run/"
TTS_ENDPOINT = os.getenv("TTS_ENDPOINT", "")
STT_ENDPOINT = BASE_URL + os.getenv("STT_ENDPOINT", "")

if TTS_ENDPOINT == "":
    raise Exception("TTS_ENDPOINT is not set.")

if STT_ENDPOINT == "":
    raise Exception("STT_ENDPOINT is not set.")


def check_api_key() -> str:
    key = os.getenv("FAL_KEY")
    if not key:
        print("error: FAL_KEY environment variable is not set.")
        sys.exit(1)
    return key


def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(f"  [TTS] {log['message']}")


def generate_speech(text: str, response_format: str = "wav", speed: float = 1.0) -> dict:
    print(f"Generating speech for: '{text[:50]}...' ({len(text)} chars)")

    result = fal_client.subscribe(
        TTS_ENDPOINT,
        arguments={
            "input": text,
            "response_format": response_format,
            "speed": speed,
        },
        path="/generate",
        with_logs=True,
        on_queue_update=on_queue_update,
    )

    return result


def download_audio(url: str) -> bytes:
    print("downloading audio from CDN...")
    response = httpx.get(url, timeout=60.0, follow_redirects=True)
    response.raise_for_status()
    print(f"  downloaded {len(response.content)} bytes")
    return response.content


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.wav",
) -> dict:
    fal_key = os.getenv("FAL_KEY")

    print("transcribing audio...")

    headers = {"Authorization": f"Key {fal_key}"}
    files = {"file": (filename, audio_bytes)}

    response = httpx.post(
        STT_ENDPOINT + "/audio/transcriptions",
        headers=headers,
        files=files,
        data={"language": "tr"},
        timeout=120.0
    )
    response.raise_for_status()

    return response.json()


def run_pipeline(text: str, save_audio: bool = True) -> dict:
    results = {"input_text": text, "language": "tr"}
    total_start = time.perf_counter()

    print()
    print("step 1: text-to-speech")
    print("-" * 40)

    tts_start = time.perf_counter()
    tts_result = generate_speech(text, response_format="wav", speed=1.0)
    tts_elapsed = time.perf_counter() - tts_start

    audio_url = tts_result["audio"]["url"]
    results["tts"] = {
        "audio_url": audio_url,
        "inference_time_ms": tts_result.get("inference_time_ms"),
        "audio_duration_sec": tts_result.get("audio_duration_sec"),
        "elapsed_time_sec": round(tts_elapsed, 3),
    }

    print(f"  audio URL: {audio_url[:60]}...")
    print(f"  inference: {tts_result.get('inference_time_ms', 'N/A')}ms")
    print(f"  duration:  {tts_result.get('audio_duration_sec', 'N/A')}s")

    print()
    print("step 2: download audio")
    print("-" * 40)

    download_start = time.perf_counter()
    audio_bytes = download_audio(audio_url)
    download_elapsed = time.perf_counter() - download_start

    results["download"] = {
        "size_bytes": len(audio_bytes),
        "elapsed_time_sec": round(download_elapsed, 3),
    }

    if save_audio:
        output_path = Path("pipeline_audio.wav")
        output_path.write_bytes(audio_bytes)
        results["download"]["saved_to"] = str(output_path)
        print(f"  saved to: {output_path}")

    print()
    print("step 3: speech-to-text")
    print("-" * 40)

    stt_start = time.perf_counter()
    stt_result = transcribe_audio(audio_bytes, "audio.wav")
    stt_elapsed = time.perf_counter() - stt_start

    transcribed_text = stt_result.get("text", "")
    results["stt"] = {
        "transcribed_text": transcribed_text,
        "elapsed_time_sec": round(stt_elapsed, 3),
        "full_response": stt_result,
    }

    print(f"  transcribed: '{transcribed_text}'")

    total_elapsed = time.perf_counter() - total_start

    results["totals"] = {
        "total_elapsed_sec": round(total_elapsed, 3),
        "tts_time_sec": round(tts_elapsed, 3),
        "download_time_sec": round(download_elapsed, 3),
        "stt_time_sec": round(stt_elapsed, 3),
    }

    results["comparison"] = {
        "input_text": text,
        "output_text": transcribed_text,
        "input_length": len(text),
        "output_length": len(transcribed_text),
    }

    return results


def main():
    parser = argparse.ArgumentParser(description="run TTS->STT round-trip pipeline")
    parser.add_argument("text", nargs="*", default=["Selam, merhaba!"])
    parser.add_argument("--no-save", action="store_true")

    args = parser.parse_args()
    text = " ".join(args.text)

    check_api_key()

    print("=" * 60)
    print("freya TTS -> STT pipeline")
    print("=" * 60)

    try:
        results = run_pipeline(text=text, save_audio=not args.no_save)

        print()
        print("=" * 60)
        print("pipeline results")
        print("=" * 60)
        print()

        print("timing:")
        print(f"  tts generation:  {results['totals']['tts_time_sec']}s")
        print(f"  audio download:  {results['totals']['download_time_sec']}s")
        print(f"  stt transcribe:  {results['totals']['stt_time_sec']}s")
        print(f"  total pipeline:  {results['totals']['total_elapsed_sec']}s")
        print()

        print("round-trip comparison:")
        print(f"  input:  '{results['comparison']['input_text']}'")
        print(f"  output: '{results['comparison']['output_text']}'")

        if results.get("download", {}).get("saved_to"):
            print()
            print(f"audio saved to: {results['download']['saved_to']}")

    except httpx.HTTPStatusError as e:
        print(f"HTTP Error: {e}")
        print(f"response: {e.response.text[:500]}")
        sys.exit(1)
    except Exception as e:
        from traceback import print_exc
        print_exc()
        print(f"pipeline error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
