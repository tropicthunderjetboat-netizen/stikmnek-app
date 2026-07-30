begin;
update public.business_offerings set title = 'E''Nauwi Beach Resort — Beachfront Stay, Eratap', updated_at = now() where id = '4acfcbc7-fb7a-49e5-b0d6-5038db215a63'::uuid;
update public.business_offerings set title = 'Aore Hibiscus Retreat — Self-Contained Bungalow, Aore Island', updated_at = now() where id = 'b21d4be2-827d-467d-b3e5-15b11caef9b4'::uuid;
update public.business_offerings set title = 'Quinzy Authentic Tours — Mele Beach Bar Fire Show Shuttle', updated_at = now() where id = 'c422c44e-197e-4c85-9683-ba6ae0104cf6'::uuid;
update public.business_offerings set title = 'Quinzy Authentic Tours — Distillery, Coffee & Chocolate Tasting Tour', updated_at = now() where id = 'ec88a7c0-ab72-40ee-a8a5-fed77b29dd95'::uuid;
update public.business_offerings set title = 'Marcel Water Taxi — Kids Fishing Charter, Port Vila', updated_at = now() where id = 'a3cb0b0a-0452-4e59-9cdb-db188f14f228'::uuid;
update public.business_offerings set title = 'Vanuatu Jungle Zipline — Zipline, Canyon Swing & Skybridge Combo', updated_at = now() where id = '552c5f51-9a7f-4212-8cc9-fdf39f4b8f23'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.'
    when description like 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.%' then description
    else 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.'
    when description_fr like 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.%' then description_fr
    else 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.'
    when description_bi like 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.%' then description_bi
    else 'Handmade island dresses, weaving, salusalu and earrings by Esline Toamavute in Vanuatu.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'f43c2a66-73c3-4550-93af-902404b77769'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.'
    when description like 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.%' then description
    else 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.'
    when description_fr like 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.%' then description_fr
    else 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.'
    when description_bi like 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.%' then description_bi
    else 'Hands-on handicraft workshops — weaving, sewing, painting and carving — at Lei''s Handicraft Shop on the Port Vila seafront.' || ' ' || description_bi
  end,
  updated_at = now()
where id = '186b4ee2-ef0f-4b05-ba1a-5686f8b8e347'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.'
    when description like 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.%' then description
    else 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.'
    when description_fr like 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.%' then description_fr
    else 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.'
    when description_bi like 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.%' then description_bi
    else 'Game fishing charter departing 6:00 AM from Ifira Town Wharf, Port Vila.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'b0f46231-102d-416d-929b-17863f35afb6'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'A 4-hour family fishing charter on a local banana boat from Port Vila.'
    when description like 'A 4-hour family fishing charter on a local banana boat from Port Vila.%' then description
    else 'A 4-hour family fishing charter on a local banana boat from Port Vila.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'A 4-hour family fishing charter on a local banana boat from Port Vila.'
    when description_fr like 'A 4-hour family fishing charter on a local banana boat from Port Vila.%' then description_fr
    else 'A 4-hour family fishing charter on a local banana boat from Port Vila.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'A 4-hour family fishing charter on a local banana boat from Port Vila.'
    when description_bi like 'A 4-hour family fishing charter on a local banana boat from Port Vila.%' then description_bi
    else 'A 4-hour family fishing charter on a local banana boat from Port Vila.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'a3cb0b0a-0452-4e59-9cdb-db188f14f228'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.'
    when description like 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.%' then description
    else 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.'
    when description_fr like 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.%' then description_fr
    else 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.'
    when description_bi like 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.%' then description_bi
    else 'Hand-painted lava-lavas and local handicrafts sold at a stall on Efate, Vanuatu.' || ' ' || description_bi
  end,
  updated_at = now()
where id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.'
    when description like 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.%' then description
    else 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.'
    when description_fr like 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.%' then description_fr
    else 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.'
    when description_bi like 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.%' then description_bi
    else 'Locally made Vanuatu handicrafts at Mahitahi Haos Blo Handicraft on the Port Vila seafront, near Nambawan Café.' || ' ' || description_bi
  end,
  updated_at = now()
where id = '6f58d867-0422-43dd-854d-56edd71646a1'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.'
    when description like 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.%' then description
    else 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.'
    when description_fr like 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.%' then description_fr
    else 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.'
    when description_bi like 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.%' then description_bi
    else 'Friday shuttle to the Mele Beach Bar fire show, with hotel pickups around Port Vila.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'c422c44e-197e-4c85-9683-ba6ae0104cf6'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.'
    when description like 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.%' then description
    else 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.'
    when description_fr like 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.%' then description_fr
    else 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.'
    when description_bi like 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.%' then description_bi
    else 'Combo tour near Port Vila: ziplines, canyon rope swing, skybridge and gardens walk, with hotel transfers.' || ' ' || description_bi
  end,
  updated_at = now()
where id = '552c5f51-9a7f-4212-8cc9-fdf39f4b8f23'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.'
    when description like 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.%' then description
    else 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.'
    when description_fr like 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.%' then description_fr
    else 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.'
    when description_bi like 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.%' then description_bi
    else 'Self-contained bungalow stay on Aore Island, a short boat ride from Espiritu Santo.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'b21d4be2-827d-467d-b3e5-15b11caef9b4'::uuid;

update public.business_offerings
set
  description = case
    when description is null or btrim(description) = '' then 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.'
    when description like 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.%' then description
    else 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.' || ' ' || description
  end,
  description_fr = case
    when description_fr is null or btrim(description_fr) = '' then 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.'
    when description_fr like 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.%' then description_fr
    else 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.' || ' ' || description_fr
  end,
  description_bi = case
    when description_bi is null or btrim(description_bi) = '' then 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.'
    when description_bi like 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.%' then description_bi
    else 'Guided tasting tour visiting an 83 Distillery, Tanna Coffee and a chocolate factory near Port Vila.' || ' ' || description_bi
  end,
  updated_at = now()
where id = 'ec88a7c0-ab72-40ee-a8a5-fed77b29dd95'::uuid;

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
order by title;
commit;