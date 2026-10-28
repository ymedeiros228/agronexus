-- A opção "Enable automatic RLS" do painel cria public.rls_auto_enable() (gatilho de eventos,
-- SECURITY DEFINER) executável por qualquer um. Não dá para chamá-la pela API (é função de
-- gatilho), mas o Security Advisor aponta, e ninguém de fora precisa executá-la. O gatilho
-- continua funcionando: a permissão de executar só é conferida quando ele é criado.
-- Em banco que não tem a função (local, outro projeto), não faz nada.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
