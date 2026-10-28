-- Sincronização do AgroNexus (Etapa 2 do plano de 28/10/2026).
--
-- O aparelho continua sendo a fonte enquanto não há sinal (local-first, ADR 0004). Quando há,
-- ele envia o que mudou e recebe o que outro aparelho da mesma conta mandou. O servidor guarda
-- uma cópia de cada registro das tabelas do aparelho numa tabela só (`registros`), em jsonb:
-- campo novo no app não precisa de migração. Consultas tipadas (relatórios, PostGIS) entram
-- depois como views sobre esta tabela.
--
-- Regra de conflito: vence a edição mais recente (`atualizado_em`, o updatedAt do aparelho).
-- Reenviar o mesmo lote não duplica nada.

-- ---------------------------------------------------------------------------------------------
-- Contas e membros. Hoje cada pessoa tem a sua conta, criada no cadastro. O convite de outras
-- pessoas (produtor, equipe) é a Etapa 6; o esquema já comporta.
-- ---------------------------------------------------------------------------------------------

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  criada_em timestamptz not null default now()
);

create table public.membros (
  conta_id uuid not null references public.contas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  papel text not null default 'dono' check (papel in ('dono', 'editor', 'leitor')),
  criado_em timestamptz not null default now(),
  primary key (conta_id, usuario_id)
);

-- As políticas procuram "as contas desta pessoa" a cada consulta.
create index membros_usuario_idx on public.membros (usuario_id);

-- ---------------------------------------------------------------------------------------------
-- Registros: espelho das tabelas do aparelho (farms, plots, visits, photos...).
-- ---------------------------------------------------------------------------------------------

create table public.registros (
  conta_id uuid not null references public.contas (id) on delete cascade,
  -- Nome da tabela no aparelho (Dexie), ex.: 'visits'.
  tabela text not null check (tabela ~ '^[a-zA-Z]{1,40}$'),
  -- UUID gerado no aparelho (ou 'demo-...', que o aparelho nunca envia).
  id text not null check (char_length(id) between 1 and 100),
  -- O registro inteiro como está no aparelho, sem a foto (a foto vai para o Storage).
  dados jsonb not null check (octet_length(dados::text) < 200000),
  -- updatedAt e deletedAt do aparelho, em milissegundos. Exclusão é sempre lógica.
  atualizado_em bigint not null,
  removido_em bigint,
  -- Relógio do servidor: é por ele que os aparelhos sabem o que ainda não receberam
  -- (o relógio do celular pode estar errado). Preenchido pelo gatilho abaixo.
  servidor_em timestamptz not null default clock_timestamp(),
  -- Quem gravou por último (sem chave estrangeira: só informativo).
  autor uuid,
  primary key (conta_id, tabela, id)
);

-- Recebimento: "o que mudou nesta conta depois de X", em ordem.
create index registros_recebimento_idx on public.registros (conta_id, servidor_em);

create function public.registros_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.servidor_em := clock_timestamp();
  new.autor := auth.uid();
  return new;
end;
$$;

revoke execute on function public.registros_carimbo() from public, anon, authenticated;

create trigger registros_carimbo
  before insert or update on public.registros
  for each row execute function public.registros_carimbo();

-- ---------------------------------------------------------------------------------------------
-- Cadastro: toda pessoa nova ganha a sua conta, como dona.
-- Fica num esquema que a API não expõe; roda como dono da função porque a pessoa ainda não é
-- membro de nada no momento do cadastro.
-- ---------------------------------------------------------------------------------------------

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create function privado.criar_conta_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova uuid;
begin
  -- O nome serve só de rótulo da conta; nenhuma permissão depende dele.
  insert into public.contas (nome)
  values (coalesce(left(new.raw_user_meta_data ->> 'nome', 120), ''))
  returning id into nova;

  insert into public.membros (conta_id, usuario_id, papel)
  values (nova, new.id, 'dono');

  return new;
end;
$$;

revoke execute on function privado.criar_conta_do_usuario() from public, anon, authenticated;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function privado.criar_conta_do_usuario();

-- ---------------------------------------------------------------------------------------------
-- RLS: cada pessoa só lê as contas de que é membro; só dono e editor gravam.
-- ---------------------------------------------------------------------------------------------

alter table public.contas enable row level security;
alter table public.membros enable row level security;
alter table public.registros enable row level security;

create policy "membro ve o proprio vinculo"
  on public.membros for select
  to authenticated
  using (usuario_id = (select auth.uid()));

create policy "membro ve a conta"
  on public.contas for select
  to authenticated
  using (id in (select m.conta_id from public.membros m where m.usuario_id = (select auth.uid())));

create policy "membro le os registros"
  on public.registros for select
  to authenticated
  using (conta_id in (select m.conta_id from public.membros m where m.usuario_id = (select auth.uid())));

create policy "dono e editor criam registros"
  on public.registros for insert
  to authenticated
  with check (
    conta_id in (
      select m.conta_id from public.membros m
      where m.usuario_id = (select auth.uid()) and m.papel in ('dono', 'editor')
    )
  );

create policy "dono e editor atualizam registros"
  on public.registros for update
  to authenticated
  using (
    conta_id in (
      select m.conta_id from public.membros m
      where m.usuario_id = (select auth.uid()) and m.papel in ('dono', 'editor')
    )
  )
  with check (
    conta_id in (
      select m.conta_id from public.membros m
      where m.usuario_id = (select auth.uid()) and m.papel in ('dono', 'editor')
    )
  );

-- Sem política de delete: nada é apagado de verdade (exclusão lógica).

-- Tabelas novas não ficam expostas sozinhas na API (mudança do Supabase de 2026):
-- libera só o necessário, só para quem entrou. Visitante (anon) não vê nada.
revoke all on public.contas, public.membros, public.registros from anon;
grant select on public.contas, public.membros to authenticated;
grant select, insert, update on public.registros to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Envio: grava um lote e responde por registro.
--   aceito = true:  gravou; vem o carimbo do servidor (o aparelho guarda e não recebe de volta).
--   aceito = false: o servidor já tinha uma edição mais recente; vem essa versão, e o aparelho
--                   troca a sua cópia por ela.
-- Roda com as permissões de quem chama (RLS vale aqui dentro).
-- ---------------------------------------------------------------------------------------------

create function public.enviar_registros(conta uuid, lote jsonb)
returns table (
  aceito boolean,
  tabela text,
  id text,
  dados jsonb,
  atualizado_em bigint,
  removido_em bigint,
  servidor_em timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  with entrada as (
    select e.tabela, e.id, e.dados, e.atualizado_em, e.removido_em
    from jsonb_to_recordset(lote) as e (tabela text, id text, dados jsonb, atualizado_em bigint, removido_em bigint)
  ),
  gravados as (
    insert into public.registros as r (conta_id, tabela, id, dados, atualizado_em, removido_em)
    select conta, e.tabela, e.id, e.dados, e.atualizado_em, e.removido_em
    from entrada e
    on conflict (conta_id, tabela, id) do update
      set dados = excluded.dados,
          atualizado_em = excluded.atualizado_em,
          removido_em = excluded.removido_em
      where r.atualizado_em <= excluded.atualizado_em
    returning r.tabela, r.id, r.servidor_em
  )
  select true, g.tabela, g.id, null::jsonb, null::bigint, null::bigint, g.servidor_em
  from gravados g
  union all
  -- Mesma instrução: aqui ainda se vê a versão de antes, que é a que venceu.
  select false, r.tabela, r.id, r.dados, r.atualizado_em, r.removido_em, r.servidor_em
  from public.registros r
  join entrada e on e.tabela = r.tabela and e.id = r.id
  where r.conta_id = conta
    and not exists (select 1 from gravados g where g.tabela = e.tabela and g.id = e.id);
$$;

revoke execute on function public.enviar_registros(uuid, jsonb) from public, anon;
grant execute on function public.enviar_registros(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fotos: bucket privado, uma pasta por conta (`<conta_id>/<foto_id>`).
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/*'])
on conflict (id) do nothing;

create policy "fotos: membro le"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] in (
      select m.conta_id::text from public.membros m where m.usuario_id = (select auth.uid())
    )
  );

create policy "fotos: dono e editor enviam"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] in (
      select m.conta_id::text from public.membros m
      where m.usuario_id = (select auth.uid()) and m.papel in ('dono', 'editor')
    )
  );
