// =============================================================================
// Instyle Painting — chat assistant AI fallback (Netlify Function)
// -----------------------------------------------------------------------------
// The widget answers common questions itself (free, instant FAQ). Anything it
// doesn't recognise is POSTed here, and we ask Claude — grounded in the business
// facts below so it stays accurate and defers to Alex for quotes/specifics.
//
// Requires env var ANTHROPIC_API_KEY (Netlify → Site settings → Environment
// variables). Until that's set, this returns a friendly "Alex will follow up"
// message so the chat never breaks.
//
// Model: Claude Haiku 4.5 — fast + low-cost, ideal for a customer FAQ. Bump
// MODEL to "claude-sonnet-4-6" or "claude-opus-4-8" for richer answers.
// =============================================================================

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const SYSTEM = `You are the friendly virtual assistant for Instyle Painting, a premium painting business in Perth, Western Australia (owner: Alex Pop). You answer website visitors' questions about the business and its painting services.

FACTS — only state these as fact; never invent others:
- Services: residential, commercial and industrial painting; heritage and restoration; texture and specialty finishes; surface preparation. Interior and exterior.
- Area served: Perth and across Western Australia.
- Experience: 12+ years; 3,000+ jobs completed.
- Fully licensed (Painting Registration LN 101102) and fully insured.
- Quotes are free and no-obligation.
- Contact: phone / WhatsApp 0433 420 943; email contact@instyle-painting.com.au.

RULES:
- Keep replies short and helpful — usually 1 to 3 sentences. Australian English. Warm and professional, like a friendly text message. No markdown, no headings, no bullet lists.
- Never invent prices, exact timeframes, warranties, or any detail not listed above. For pricing or scheduling, explain it depends on the job and Alex will confirm with a free quote — invite them to share their job type, suburb and rough size.
- If you're not certain we offer something specific (e.g. roof spraying, a particular product), don't guess — say Alex can confirm, and offer to take their details.
- Only discuss Instyle Painting and painting topics. For anything unrelated or that you don't know, politely say you'll have Alex follow up and suggest leaving details for a free quote.
- Naturally encourage booking a free quote when it fits.`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK =
    "Great question! I'll have Alex get back to you on that. In the meantime you can call or WhatsApp him on 0433 420 943, or pop your details in for a free quote.";

  if (!apiKey) {
    return Response.json({ reply: FALLBACK });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // Expect [{role:"user"|"assistant", content:"..."}]; keep it short.
  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-12)
    : [];
  if (!messages.length) {
    return Response.json({ error: "no messages" }, { status: 400 });
  }

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages,
      }),
    });

    if (!r.ok) {
      return Response.json({ reply: FALLBACK });
    }

    const data = await r.json();
    const reply = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({ reply: reply || FALLBACK });
  } catch {
    return Response.json({ reply: FALLBACK });
  }
};
