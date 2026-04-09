/**
 * Type shims for Supabase Edge Functions (Deno) so tsserver understands this
 * folder without the Deno VS Code extension. Runtime is still Deno on deploy.
 *
 * Return type is `any` so table-level generics from `@supabase/supabase-js` do not
 * collapse to `never` when no generated `Database` type is wired in.
 */
declare const Deno: {
  readonly env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): any;
}
