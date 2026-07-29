-- Rebuild static SEO pages when partner/deal rows change.
-- Edge Function `trigger-ssg-rebuild` POSTs the Vercel Deploy Hook.
--
-- After migrate, set vault secrets (Dashboard → Project Settings → Vault), then
-- the triggers will call the function. Until secrets exist, the function is a no-op.
--
--   ssg_rebuild_function_url = https://hbaflbmfptobyfqbudrt.supabase.co/functions/v1/trigger-ssg-rebuild
--   ssg_rebuild_secret       = <same value as Edge Function secret SSG_REBUILD_SECRET>
--
-- Also set Edge Function secrets:
--   supabase secrets set VERCEL_DEPLOY_HOOK_URL="https://api.vercel.com/v1/integrations/deploy/..."
--   supabase secrets set SSG_REBUILD_SECRET="<long random string>"

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_ssg_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  secret text;
begin
  begin
    select ds.decrypted_secret into fn_url
    from vault.decrypted_secrets ds
    where ds.name = 'ssg_rebuild_function_url'
    limit 1;
    select ds.decrypted_secret into secret
    from vault.decrypted_secrets ds
    where ds.name = 'ssg_rebuild_secret'
    limit 1;
  exception
    when undefined_table then
      fn_url := null;
    when undefined_object then
      fn_url := null;
    when others then
      fn_url := null;
  end;

  if fn_url is null or btrim(fn_url) = '' then
    return coalesce(NEW, OLD);
  end if;

  perform net.http_post(
    url := btrim(fn_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ssg-rebuild-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record_id', coalesce(NEW.id, OLD.id)
    )
  );

  return coalesce(NEW, OLD);
end;
$$;

comment on function public.notify_ssg_rebuild() is
  'POSTs to trigger-ssg-rebuild Edge Function so Vercel rebuilds static SEO pages.';

drop trigger if exists trg_ssg_rebuild_business_offerings on public.business_offerings;
create trigger trg_ssg_rebuild_business_offerings
  after insert or update or delete on public.business_offerings
  for each row
  execute function public.notify_ssg_rebuild();

drop trigger if exists trg_ssg_rebuild_businesses on public.businesses;
create trigger trg_ssg_rebuild_businesses
  after insert or update or delete on public.businesses
  for each row
  execute function public.notify_ssg_rebuild();
