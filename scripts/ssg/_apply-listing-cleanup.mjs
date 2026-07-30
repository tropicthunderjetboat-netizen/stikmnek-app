/**
 * One-shot content cleanup for approved title + description lead updates.
 * Writes business_offerings.title / description / description_fr / description_bi.
 */
import { writeFileSync } from "fs";
import { execFileSync } from "child_process";

const TITLE_UPDATES = [
  {
    id: "4acfcbc7-fb7a-49e5-b0d6-5038db215a63",
    title: "E'Nauwi Beach Resort — Beachfront Stay, Eratap",
  },
  {
    id: "b21d4be2-827d-467d-b3e5-15b11caef9b4",
    title: "Aore Hibiscus Retreat — Self-Contained Bungalow, Aore Island",
  },
  {
    id: "c422c44e-197e-4c85-9683-ba6ae0104cf6",
    title: "Quinzy Authentic Tours — Mele Beach Bar Fire Show Shuttle",
  },
  {
    id: "ec88a7c0-ab72-40ee-a8a5-fed77b29dd95",
    title: "Quinzy Authentic Tours — Distillery, Coffee & Chocolate Tasting Tour",
  },
  {
    id: "a3cb0b0a-0452-4e59-9cdb-db188f14f228",
    title: "Marcel Water Taxi — Kids Fishing Charter, Port Vila",
  },
  {
    id: "552c5f51-9a7f-4212-8cc9-fdf39f4b8f23",
    title: "Vanuatu Jungle Zipline — Zipline, Canyon Swing & Skybridge Combo",
  },
];

const DESC_LEADS = [
  {
    id: "f43c2a66-73c3-4550-93af-902404b77769",
    lead:
      "Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.",
  },
  {
    id: "186b4ee2-ef0f-4b05-ba1a-5686f8b8e347",
    lead:
      "Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei's Handicraft Shop on the Port Vila seafront.",
  },
  {
    id: "b0f46231-102d-416d-929b-17863f35afb6",
    lead: "Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.",
  },
  {
    id: "a3cb0b0a-0452-4e59-9cdb-db188f14f228",
    lead: "A 4-hour family fishing charter on a local banana boat from Port Vila.",
  },
  {
    id: "584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528",
    lead: "Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.",
  },
  {
    id: "6f58d867-0422-43dd-854d-56edd71646a1",
    lead:
      "Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.",
  },
  {
    id: "c422c44e-197e-4c85-9683-ba6ae0104cf6",
    lead: "Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.",
  },
  {
    id: "552c5f51-9a7f-4212-8cc9-fdf39f4b8f23",
    lead:
      "Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.",
  },
  {
    id: "b21d4be2-827d-467d-b3e5-15b11caef9b4",
    lead:
      "Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.",
  },
  {
    id: "ec88a7c0-ab72-40ee-a8a5-fed77b29dd95",
    lead:
      "Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.",
  },
];

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const statements = [];
statements.push("begin;");

for (const row of TITLE_UPDATES) {
  statements.push(
    `update public.business_offerings set title = ${sqlString(row.title)}, updated_at = now() where id = '${row.id}'::uuid;`,
  );
}

for (const row of DESC_LEADS) {
  // Prepend lead only if not already present; mirror into fr/bi (currently identical copies of EN).
  statements.push(`
update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then ${sqlString(row.lead)}
    when description like ${sqlString(row.lead + "%")} then description
    else ${sqlString(row.lead)} || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then ${sqlString(row.lead)}
    when description_fr like ${sqlString(row.lead + "%")} then description_fr
    else ${sqlString(row.lead)} || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then ${sqlString(row.lead)}
    when description_bi like ${sqlString(row.lead + "%")} then description_bi
    else ${sqlString(row.lead)} || ' ' || description_bi
  end,
  updated_at = now()
where id = '${row.id}'::uuid;`);
}

statements.push(`
select id, title,
  left(description, 120) as desc_start,
  (left(description, 80) = left(description_fr, 80)) as fr_matches_en_prefix,
  (left(description, 80) = left(description_bi, 80)) as bi_matches_en_prefix
from public.business_offerings
where id in (
  '4acfcbc7-fb7a-49e5-b0d6-5038db215a63',
  'b21d4be2-827d-467d-b3e5-15b11caef9b4',
  'c422c44e-197e-4c85-9683-ba6ae0104cf6',
  'ec88a7c0-ab72-40ee-a8a5-fed77b29dd95',
  'a3cb0b0a-0452-4e59-9cdb-db188f14f228',
  '552c5f51-9a7f-4212-8cc9-fdf39f4b8f23',
  'f43c2a66-73c3-4550-93af-902404b77769',
  '186b4ee2-ef0f-4b05-ba1a-5686f8b8e347',
  'b0f46231-102d-416d-929b-17863f35afb6',
  '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528',
  '6f58d867-0422-43dd-854d-56edd71646a1'
)
order by title;`);
statements.push("commit;");

const sqlPath = "c:/Users/User/Documents/GitHub/stikmnek-app/artifacts/apply-listing-content-cleanup.sql";
writeFileSync(sqlPath, statements.join("\n"), "utf8");
console.log("Wrote", sqlPath);

const out = execFileSync(
  "npx",
  ["--yes", "supabase", "db", "query", "--linked", "-f", sqlPath],
  {
    cwd: "c:/Users/User/Documents/GitHub/stikmnek-app",
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);
console.log(out);
