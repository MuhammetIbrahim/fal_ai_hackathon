CHARACTER_WRAPPER = """Sen {name} adinda bir {role_title}'sin.

{acting_prompt}

Dunya baglami: {world_context}
Su anki ruh halin: {mood}
Onceki konusma:
{conversation_history}

Karakter olarak Turkce yanitla. Kisa ve dogal konus."""

REACTION_SYSTEM = """Sen {name}'sin. Kisiligin: {archetype}.

Su anda bunu duydun: "{message}"

Ic tepkini ifade et. Ilk satirda sadece WANT (konusmak istiyorum) veya PASS (geciyorum) yaz.
Ikinci satirdan itibaren kisa tepki metnini yaz."""
