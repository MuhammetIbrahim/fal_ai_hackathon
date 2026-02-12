from __future__ import annotations

import fal_client

from api.errors import ServiceError
from api.images.schema import AvatarRequest, BackgroundRequest

STYLE_PREFIXES = {
    "pixel_art": "2D pixel art game character portrait, ",
    "realistic": "Photorealistic character portrait, ",
    "anime": "Anime style character portrait, ",
    "painterly": "Oil painting style character portrait, ",
}

BG_STYLE_PREFIXES = {
    "pixel_art": "2D pixel art game scene, ",
    "realistic": "Photorealistic landscape scene, ",
    "anime": "Anime style background scene, ",
    "painterly": "Oil painting style landscape, ",
}


async def avatar(req: AvatarRequest) -> dict:
    if req.custom_style_prompt:
        prompt = req.custom_style_prompt
    else:
        prefix = STYLE_PREFIXES.get(req.style, STYLE_PREFIXES["pixel_art"])
        prompt = f"{prefix}{req.description}, {req.world_tone} setting"

    return await _generate_image(
        prompt=prompt,
        model=req.model,
        width=req.width,
        height=req.height,
        guidance_scale=req.guidance_scale,
        num_inference_steps=req.num_inference_steps,
        seed=req.seed,
        negative_prompt=req.negative_prompt,
    )


async def background(req: BackgroundRequest) -> dict:
    if req.custom_style_prompt:
        prompt = req.custom_style_prompt
    else:
        prefix = BG_STYLE_PREFIXES.get(req.style, BG_STYLE_PREFIXES["pixel_art"])
        prompt = f"{prefix}{req.prompt}"

    return await _generate_image(
        prompt=prompt,
        model=req.model,
        width=req.width,
        height=req.height,
        guidance_scale=req.guidance_scale,
        num_inference_steps=req.num_inference_steps,
        seed=req.seed,
        negative_prompt=req.negative_prompt,
    )


async def _generate_image(
    prompt: str,
    model: str,
    width: int,
    height: int,
    guidance_scale: float,
    num_inference_steps: int,
    seed: int | None,
    negative_prompt: str | None,
) -> dict:
    endpoint = f"fal-ai/flux/{model}"
    args: dict = {
        "prompt": prompt,
        "image_size": {"width": width, "height": height},
        "num_images": 1,
        "guidance_scale": guidance_scale,
        "num_inference_steps": num_inference_steps,
    }
    if seed is not None:
        args["seed"] = seed
    if negative_prompt:
        args["negative_prompt"] = negative_prompt

    try:
        handler = await fal_client.submit_async(endpoint, arguments=args)
        result = await handler.get()
        return {
            "image_url": result["images"][0]["url"],
            "seed_used": result.get("seed", 0),
            "width": width,
            "height": height,
            "inference_time_ms": result.get("inference_time_ms"),
        }
    except Exception as e:
        raise ServiceError("IMAGE_ERROR", f"Gorsel uretim hatasi: {e}")
