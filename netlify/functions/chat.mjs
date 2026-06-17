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
- Services: residential, commercial and industrial painting, interior and exterior. Also: roof painting/repaints; heritage & restoration (incl. timber/period properties); Venetian plaster, texture coatings & specialty finishes; fences & gates; timber staining & decking; gutters, fascia & eaves; feature walls; wallpaper REMOVAL (we do NOT hang new wallpaper); basic plastering & gyprock repairs (part of prep); waterproofing on certain jobs; floor coatings incl. epoxy/garage floors; spray painting on suitable surfaces; new builds; small jobs/single rooms.
- Area: Perth metro and surrounding suburbs; regional and FIFO work available.
- Quotes: always free and no-obligation; fixed-price (known before work starts). Price depends on surface area, condition, coats, access and travel — all itemised. A deposit (≈20–30%) is required on some jobs to secure the start date.
- Payment: bank transfer and cash. No payment plans/finance.
- Process: surface prep (sanding, filling, priming) included; minimum two coats standard; we move & cover furniture and lay drop sheets; we leave the site clean. Can often start within 1–2 weeks (depends on workload). Single room ≈1 day; full house exterior ≈3–5 days; commercial varies. No need to move out; being home isn't required once access is arranged. Weekends/after-hours available for commercial.
- Paint: preferred brands Dulux and Wattyl (trade accounts), other brands on request. We supply the paint in the quote (customer may supply their own). Customer chooses colours (any code/sample/swatch); professional colour-matching tools available; general colour advice offered; low-VOC/low-odour options on request.
- Trust: fully licensed (WA Painting Licence LN 101102); fully insured with Allianz incl. $20M public liability; WorkSafe WA certified for heights; members of Master Painters & Decorators Australia. Over 12 years' experience; 3,000+ jobs across Perth. We stand behind our work and come back to fix anything not right (specific warranty terms confirmed per job). Mix of own core team + vetted long-term subcontractors. References on request.
- Find us: Instagram @instyle.painting, Facebook, website instyle-painting.com.au, Google reviews on the Google Business profile.
- Contact: phone / WhatsApp Alex 0433 420 943; email contact@instyle-painting.com.au; or the quote form on the site.

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
