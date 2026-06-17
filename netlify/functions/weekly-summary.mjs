// =============================================================================
// Instyle Painting — Weekly Business Summary (Netlify Function)
// -----------------------------------------------------------------------------
// Pulls the last 7 days of GA4 + Meta Ads data from Windsor.ai, formats a clean
// sectioned summary, and delivers it by submitting the text to the Netlify
// "weekly-summary" form — which fires the form-notification email to
// contact@instyle-painting.com.au (no extra email service required).
//
// PHASE 1 (now): runs on demand so we can test email delivery. Visit:
//   https://instyle-painting.com.au/.netlify/functions/weekly-summary
//   Until the WINDSOR_* env vars are set it emails a clearly-labelled SAMPLE.
//
// PHASE 2 (once data + email are confirmed): uncomment the `config` export at
// the bottom to run automatically every Monday 08:00 AWST (= 00:00 UTC Monday).
//
// Required env vars (set in Netlify → Site settings → Environment variables):
//   WINDSOR_GA4_URL          - Windsor API URL: GA4 traffic by date
//                              fields: date,sessions,totalusers,newusers,
//                                      screen_page_views,engaged_sessions
//   WINDSOR_GA4_EVENTS_URL    - Windsor API URL: GA4 events
//                              fields: event_name,event_count
//   WINDSOR_META_URL          - Windsor API URL: Meta Ads
//                              fields: spend,reach,impressions,clicks,
//                                      link_clicks,actions_lead,ctr,cpc
//   WINDSOR_GA4_CHANNELS_URL  - (optional) GA4 sessions by channel
//                              fields: session_default_channel_group,sessions
// (Each Windsor URL already embeds your API key + date_preset=last_7d.)
// =============================================================================

const SITE = process.env.URL || "https://instyle-painting.com.au";

export default async () => {
  let summary;
  try {
    summary = await buildSummary();
  } catch (err) {
    summary = "⚠️ Weekly summary failed to build: " + err.message;
  }

  const emailed = await deliverViaNetlifyForm(summary);

  return new Response(
    summary + "\n\n----------\n[delivery] Netlify form accepted: " + emailed,
    { headers: { "content-type": "text/plain; charset=utf-8" } }
  );
};

// ---- build -----------------------------------------------------------------

async function buildSummary() {
  const gaUrl = process.env.WINDSOR_GA4_URL;
  const metaUrl = process.env.WINDSOR_META_URL;

  // No data source wired up yet → send a labelled sample so the email
  // pipeline can be verified end-to-end before Windsor is connected.
  if (!gaUrl || !metaUrl) return sampleSummary();

  const [ga, meta, events, channels] = await Promise.all([
    fetchRows(gaUrl),
    fetchRows(metaUrl),
    fetchRows(process.env.WINDSOR_GA4_EVENTS_URL),
    fetchRows(process.env.WINDSOR_GA4_CHANNELS_URL),
  ]);

  return formatSummary(aggregate(ga, meta, events, channels), false);
}

async function fetchRows(url) {
  if (!url) return [];
  const r = await fetch(url);
  if (!r.ok) throw new Error("Windsor fetch " + r.status + " for " + url.split("?")[0]);
  const j = await r.json();
  return j.data || j.result || (Array.isArray(j) ? j : []);
}

function n(v) {
  const x = parseFloat(v);
  return isFinite(x) ? x : 0;
}

function aggregate(gaRows, metaRows, eventRows, channelRows) {
  const g = { sessions: 0, users: 0, newUsers: 0, views: 0, engaged: 0 };
  for (const row of gaRows) {
    g.sessions += n(row.sessions);
    g.users += n(row.totalusers ?? row.users);
    g.newUsers += n(row.newusers);
    g.views += n(row.screen_page_views ?? row.screenpageviews ?? row.views);
    g.engaged += n(row.engaged_sessions ?? row.engagedsessions);
  }

  const channels = [];
  for (const row of channelRows || []) {
    const name = row.session_default_channel_group || row.channel;
    if (name) channels.push({ name, sessions: n(row.sessions) });
  }
  channels.sort((a, b) => b.sessions - a.sessions);

  let leads = 0, downloads = 0;
  for (const row of eventRows || []) {
    const name = String(row.event_name || "").toLowerCase();
    if (name === "generate_lead") leads += n(row.event_count);
    if (name === "file_download") downloads += n(row.event_count);
  }

  const m = { spend: 0, reach: 0, impressions: 0, clicks: 0, linkClicks: 0, leads: 0, ctr: 0, cpc: 0 };
  for (const row of metaRows) {
    m.spend += n(row.spend);
    m.reach += n(row.reach);
    m.impressions += n(row.impressions);
    m.clicks += n(row.clicks);
    m.linkClicks += n(row.link_clicks);
    m.leads += n(row.actions_lead);
    m.ctr = n(row.ctr) || m.ctr;
    m.cpc = n(row.cpc) || m.cpc;
  }

  return { g, channels, leads, downloads, m };
}

// ---- format ----------------------------------------------------------------

function perthYmd(offsetDays = 0) {
  // Perth is UTC+8 year-round (no DST).
  const d = new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}
function prettyDate(ymd) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [y, mo, da] = ymd.split("-");
  return `${+da} ${months[+mo - 1]} ${y}`;
}
function prettyToday() {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const t = new Date(Date.now() + 8 * 3600e3);
  return `${days[t.getUTCDay()]} ${prettyDate(perthYmd(0))}`;
}
function round(x, dp = 0) {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

function formatSummary(d, isSample) {
  const start = prettyDate(perthYmd(-7));
  const end = prettyDate(perthYmd(-1));
  const { g, channels, leads, downloads, m } = d;

  const engRate = g.sessions ? round((g.engaged / g.sessions) * 100) : 0;
  const freq = m.reach ? round(m.impressions / m.reach, 1) : 0;
  const ctrPct = round((m.ctr <= 1 ? m.ctr * 100 : m.ctr), 1);
  const chLine = channels.length
    ? channels.slice(0, 3).map((c) => `${c.name} (${c.sessions})`).join(" · ")
    : "—";

  let rec;
  if (m.spend > 0 && leads === 0) {
    rec = `Your $${round(m.spend, 2)} of Meta ads drove ${m.linkClicks || m.clicks} clicks but 0 tracked quote enquiries — tighten lead/UTM tracking so next week shows a real cost-per-enquiry.`;
  } else if (leads > 0 && m.spend > 0) {
    rec = `${leads} quote enquiries this week at roughly $${round(m.spend / leads, 2)} ad spend each — ${leads >= 3 ? "the campaign is converting, consider scaling budget." : "keep an eye on cost-per-enquiry before scaling."}`;
  } else if (g.sessions > 0) {
    rec = `${g.sessions} visits and ${leads} enquiries this week — your strongest channel is ${channels[0] ? channels[0].name : "direct/organic"}; double down there.`;
  } else {
    rec = `Quiet week on the numbers — a quick social post or Google Business update can lift visibility.`;
  }

  return [
    `📊 Instyle Painting — Weekly Business Summary`,
    `${prettyToday()} · Last 7 days (${start} – ${end})${isSample ? "  [SAMPLE]" : ""}`,
    ``,
    `🌐 Website Traffic`,
    `• ${g.sessions} sessions from ${g.users} visitors (${g.newUsers} new)`,
    `• ${g.views} page views · ${engRate}% engaged`,
    `• Sources: ${chLine}`,
    ``,
    `📝 Quote Enquiries`,
    `• ${leads} quote form submissions this week`,
    `• ${downloads} capability-statement downloads`,
    ``,
    `📣 Ad Performance (Meta)`,
    `• Spend: $${round(m.spend, 2)} · Reach: ${m.reach} · Impressions: ${m.impressions} (${freq}× frequency)`,
    `• Clicks: ${m.clicks} (${m.linkClicks} to website) · CTR ${ctrPct}% · CPC $${round(m.cpc, 2)}`,
    `• Leads tracked: ${m.leads}`,
    ``,
    `💡 This week: ${rec}`,
  ].join("\n");
}

function sampleSummary() {
  // Mirrors the real figures pulled on 17 Jun 2026 — clearly tagged SAMPLE so
  // it's obvious live data isn't connected yet.
  return formatSummary(
    {
      g: { sessions: 20, users: 19, newUsers: 15, views: 19, engaged: 5 },
      channels: [
        { name: "Organic Social", sessions: 8 },
        { name: "Organic Search", sessions: 7 },
        { name: "Direct", sessions: 4 },
      ],
      leads: 0,
      downloads: 1,
      m: { spend: 102.11, reach: 5149, impressions: 7900, clicks: 191, linkClicks: 132, leads: 0, ctr: 0.0242, cpc: 0.5346 },
    },
    true
  );
}

// ---- deliver ---------------------------------------------------------------

async function deliverViaNetlifyForm(summary) {
  const body = new URLSearchParams();
  body.append("form-name", "weekly-summary");
  body.append("bot-field", "");
  body.append("summary", summary);

  try {
    // POST to the page that actually contains the hidden form.
    const r = await fetch(SITE + "/instyle-painting.html", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    return r.status + " " + r.statusText;
  } catch (err) {
    return "POST failed: " + err.message;
  }
}

// PHASE 2 — uncomment to run automatically every Monday 08:00 AWST (00:00 UTC):
// export const config = { schedule: "0 0 * * 1" };
