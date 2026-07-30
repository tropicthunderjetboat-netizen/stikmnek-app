import { writeFileSync, mkdirSync } from "fs";
import { loadListings } from "./helpers.mjs";

const OUT = "c:/Users/User/Documents/GitHub/stikmnek-app/artifacts/listing-content-audit-raw.json";

function emojiCount(s) {
  const m = String(s).match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

function isGenericTitle(t) {
  const x = t.trim().toLowerCase();
  return !x || x === "offer" || x === "main offer";
}

function titleFlags(title, profileName) {
  const flags = [];
  const t = String(title ?? "");
  const em = emojiCount(t);
  if (em >= 2) flags.push("emoji_heavy");
  if (em >= 1 && t.length > 60) flags.push("emoji_plus_long");
  if (/\?/.test(t)) flags.push("contains_question");
  if ((t.match(/!/g) || []).length >= 2) flags.push("exclamation_hooks");
  if (t.length > 90) flags.push("overlong");
  if (isGenericTitle(t)) flags.push("generic_or_empty");
  if (/^(what's|what is|how |why |who |when |where )/i.test(t.trim())) flags.push("opens_as_question");
  const pn = String(profileName ?? "").trim();
  if (
    pn &&
    t.length > 50 &&
    !t.toLowerCase().includes(pn.toLowerCase().slice(0, Math.min(12, pn.length)))
  ) {
    if (em >= 1 || /\?/.test(t) || t.length > 80) flags.push("business_name_missing_or_buried");
  }
  if (/\b(unforgettable|exclusive|epic|amazing|awesome|incredible|dreamin|dreaming)\b/i.test(t)) {
    flags.push("marketing_adjectives");
  }
  return flags;
}

function firstSentence(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  return (m ? m[1] : t.slice(0, 160)).trim();
}

function descriptionFlags(desc) {
  const flags = [];
  const t = String(desc ?? "").trim();
  if (!t) {
    flags.push("empty_description");
    return { flags, lead: "" };
  }
  const lead = firstSentence(t);
  const firstPerson =
    /^(hi[,!]?\s|hello[,!]?\s|hey[,!]?\s|my name is|i'?m |i am |we are |welcome to my)/i.test(t) ||
    /^(hi[,!]?\s|hello[,!]?\s).{0,80}\b(i'?m|i am|my name)\b/i.test(t);
  if (firstPerson) flags.push("opens_first_person");

  const factualCue =
    /\b(tour|excursion|resort|bungalow|cafe|café|restaurant|spa|transfer|shuttle|shop|store|activity|pass|bundle|accommodation|lodge|hotel|island|port vila|efate|tanna|santo|aore|eratap|mele|dive|snorkel|massage|dining|bar|transport)\b/i.test(
      lead,
    );
  const hasWhere = /\b(in |at |on |near |port vila|vanuatu|efate|tanna|santo|aore|eratap|mele)\b/i.test(
    lead,
  );
  const narrativeOpen =
    firstPerson ||
    /^(come |join us|experience |discover |looking for|are you|don'?t miss|let me |let us )/i.test(t);

  if (narrativeOpen && !(factualCue && hasWhere)) {
    flags.push("no_factual_lead");
  }

  return { flags, lead };
}

function needsTitleRewrite(flags) {
  const hard = [
    "emoji_heavy",
    "contains_question",
    "exclamation_hooks",
    "overlong",
    "generic_or_empty",
    "opens_as_question",
    "business_name_missing_or_buried",
    "emoji_plus_long",
  ];
  return flags.some((f) => hard.includes(f));
}

const listings = await loadListings();
const audited = listings.map((l) => {
  const tFlags = titleFlags(l.title, l.profileName);
  const d = descriptionFlags(l.description);
  return {
    offeringId: l.offeringId,
    businessId: l.profileId,
    title: l.title,
    profileName: l.profileName,
    location: l.location,
    category: l.category,
    discount: l.discount,
    titleFlags: tFlags,
    descFlags: d.flags,
    descLead: d.lead,
    descriptionPreview: String(l.description || "").slice(0, 280),
    descriptionFull: l.description || "",
    needsTitle: needsTitleRewrite(tFlags),
    needsDescLead: d.flags.includes("no_factual_lead") || d.flags.includes("opens_first_person"),
  };
});

mkdirSync("c:/Users/User/Documents/GitHub/stikmnek-app/artifacts", { recursive: true });
writeFileSync(OUT, JSON.stringify(audited, null, 2));
console.log(
  JSON.stringify(
    {
      total: audited.length,
      needsTitle: audited.filter((l) => l.needsTitle).length,
      needsDescLead: audited.filter((l) => l.needsDescLead).length,
      either: audited.filter((l) => l.needsTitle || l.needsDescLead).length,
    },
    null,
    2,
  ),
);
