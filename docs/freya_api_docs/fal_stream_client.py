import os
import sys
import base64
import wave
import time
from pathlib import Path

import fal_client


TTS_ENDPOINT = os.getenv("TTS_ENDPOINT")
SAMPLE_RATE = 16000  # pcm16 at 16kHz

if not os.getenv("FAL_KEY"):
    raise Exception("FAL_KEY variable'i env. de tanimli degil.")

if not os.getenv("TTS_ENDPOINT"):
    raise Exception("TTS_ENDPOINT variable'i env. de tanimli degil.")


def check_api_key() -> str:
    key = os.getenv("FAL_KEY")
    if not key:
        print("FAL_KEY variable'i tanimli degil. FAL_KEY: ", key)
        sys.exit(1)
    return key

def save_pcm_as_wav(pcm_bytes: bytes, output_path: str, sample_rate: int = SAMPLE_RATE) -> Path:
    output_file = Path(output_path)
    with wave.open(str(output_file), 'wb') as wf:
        wf.setnchannels(1)       # mono
        wf.setsampwidth(2)       # 16-bit (2 bytes)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return output_file


def stream_speech(
    text: str,
    speed: float = 1.0,
    output_path: str = "stream_output.wav"
) -> dict:
    print(f"streaming...: '{text[:50]}...' ({len(text)} chars)")
    print(f"speed: {speed}")
    print()

    audio_chunks: list[bytes] = []
    chunk_count = 0
    errors: list[dict] = []
    metadata: dict = {}

    start_time = time.perf_counter()

    try:
        stream = fal_client.stream(
            TTS_ENDPOINT,
            arguments={"input": text, "speed": speed},
            path="/stream"
        )

        for event in stream:
            if "audio" in event:
                chunk_count += 1
                audio_b64 = event["audio"]
                pcm_bytes = base64.b64decode(audio_b64)
                audio_chunks.append(pcm_bytes)

                chunk_samples = len(pcm_bytes) // 2
                chunk_duration_ms = (chunk_samples / SAMPLE_RATE) * 1000
                print(f"  chunk {chunk_count}: {len(pcm_bytes)} bytes ({chunk_duration_ms:.0f}ms audio)")

            if "error" in event:
                error_info = event["error"]
                is_recoverable = event.get("recoverable", False)
                errors.append(error_info)

                if is_recoverable:
                    print(f"  warning: {error_info.get('message', 'Unknown error')} (recoverable)")
                else:
                    print(f"  error: {error_info.get('message', 'Unknown error')}")
                    raise RuntimeError(error_info.get("message", "Stream error"))

            if event.get("done"):
                metadata = {
                    "inference_time_ms": event.get("inference_time_ms"),
                    "audio_duration_sec": event.get("audio_duration_sec"),
                }
                print()
                print("stream complete!")

    except Exception as e:
        print(f"stream error: {e}")
        if not audio_chunks:
            raise

    elapsed_time = time.perf_counter() - start_time

    if not audio_chunks:
        raise RuntimeError("no audio chunks received from stream")

    all_pcm = b"".join(audio_chunks)
    output_file = save_pcm_as_wav(all_pcm, output_path)

    total_samples = len(all_pcm) // 2
    actual_duration_sec = total_samples / SAMPLE_RATE

    result = {
        "output_path": str(output_file),
        "chunk_count": chunk_count,
        "total_bytes": len(all_pcm),
        "actual_duration_sec": round(actual_duration_sec, 3),
        "elapsed_time_sec": round(elapsed_time, 3),
        "inference_time_ms": metadata.get("inference_time_ms"),
        "reported_duration_sec": metadata.get("audio_duration_sec"),
        "errors": errors if errors else None,
    }

    return result


def main():
    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
    else:
        text = "Selam, merhaba!"

    print("=" * 60)
    print("Freya TTS - Streaming Client")
    print("=" * 60)
    print()

    try:
        result = stream_speech(text=text, speed=1.0, output_path="stream_output.wav")

        print()
        print("=" * 60)
        print("results:")
        print("=" * 60)
        print(f"  output file:     {result['output_path']}")
        print(f"  chunks received: {result['chunk_count']}")
        print(f"  total size:      {result['total_bytes']} bytes")
        print(f"  audio duration:  {result['actual_duration_sec']}s")
        print(f"  elapsed time:    {result['elapsed_time_sec']}s")

        if result.get("inference_time_ms"):
            print(f"  inference time:  {result['inference_time_ms']}ms (server-reported)")

        if result.get("errors"):
            print(f"  warnings:        {len(result['errors'])} recoverable errors")

        rtf = result['elapsed_time_sec'] / result['actual_duration_sec'] if result['actual_duration_sec'] > 0 else 0
        print(f"  real-time factor: {rtf:.2f}x (< 1.0 is faster than real-time)")

    except Exception as e:
        print(f"failed to stream speech: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
