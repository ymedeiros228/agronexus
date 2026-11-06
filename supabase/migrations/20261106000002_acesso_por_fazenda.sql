-- Acesso por fazenda e dinheiro protegido (plano de 06/11/2026, Task 3).
--
-- Dono, gestor e rt veem todas as fazendas. Técnico, estagiário e leitor veem as fazendas
-- atribuídas e o que é da conta toda (fazenda_id nulo: insumos, clientes...). Produtor vê só as
-- fazendas atribuídas.
--
-- Dinheiro: só dono e gestor (e rt/produtor com ve_custos) veem `sales`, `expenses` e o campo
-- `cost` de `operations` e `stockMoves`. Para os outros, o servidor tira esses campos ao
-- entregar e nunca deixa o envio deles apagar o custo que já está gravado.
--
-- Por isso o aparelho não lê nem grava `registros` direto: tudo passa por receber_registros e
-- enviar_registros, que conferem a permissão registro por registro.

alter table public.registros add column fazenda_id text;

create table public.acessos_fazenda (
  conta_id uuid not null,
  usuario_id uuid not null,
  fazenda_id text not null,
  primary key (conta_id, usuario_id, fazenda_id),
  foreign key (conta_id, usuario_id) references public.membros (conta_id, usuario_id) on delete cascade
);

alter table public.acessos_fazenda enable row level security;

create policy "membro ve os proprios acessos"
  on public.acessos_fazenda for select
  to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on public.acessos_fazenda from anon, authenticated;
grant select on public.acessos_fazenda to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ajudantes.
-- ---------------------------------------------------------------------------------------------

create function privado.ve_tudo(conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(privado.papel_em(conta) in ('dono', 'gestor', 'rt'), false)
$$;

create function privado.ve_custos(conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.conta_id = conta and m.usuario_id = (select auth.uid())
      and (m.papel in ('dono', 'gestor') or (m.papel in ('rt', 'produtor') and m.ve_custos))
  )
$$;

create function privado.ve_fazenda(conta uuid, fazenda text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when privado.papel_em(conta) is null then false
    when privado.ve_tudo(conta) then true
    when fazenda is null then privado.papel_em(conta) <> 'produtor'
    else exists (
      select 1 from public.acessos_fazenda a
      where a.conta_id = conta and a.usuario_id = (select auth.uid()) and a.fazenda_id = fazenda
    )
  end
$$;

-- Tabelas que são dinheiro do começo ao fim, e tabelas que têm o campo `cost`.
create function privado.tabela_de_dinheiro(tabela text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select tabela in ('sales', 'expenses') $$;

-- Tabelas cujo registro é sempre de uma fazenda.
create function privado.tabela_de_fazenda(tabela text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select tabela in ('farms', 'plots', 'seasons', 'visits', 'findings', 'photos', 'rainfall', 'operations', 'points') $$;

create function privado.sem_custo(conta uuid, tabela text, dados jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when tabela in ('operations', 'stockMoves') and not privado.ve_custos(conta) then dados - 'cost'
    else dados
  end
$$;

create function privado.pode_ver(conta uuid, tabela text, fazenda text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
      -- Registro que pertence a uma fazenda mas ficou sem ela (pai ainda não chegou): só quem vê tudo.
      when fazenda is null and privado.tabela_de_fazenda(tabela) then privado.ve_tudo(conta)
      else privado.ve_fazenda(conta, fazenda)
    end
    and (not privado.tabela_de_dinheiro(tabela) or privado.ve_custos(conta))
$$;

-- A fazenda de cada registro é calculada aqui, nunca vem do aparelho: a fazenda é o próprio id
-- (farms), o farmId do registro, ou a fazenda do pai (talhão da safra, visita do achado/foto),
-- procurado primeiro no mesmo lote e depois no que já está gravado.
create function privado.fazenda_do_lote(conta uuid, lote jsonb)
returns table (tabela text, id text, dados jsonb, atualizado_em bigint, removido_em bigint, fazenda_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (
    select x.tabela, x.id, x.dados, x.atualizado_em, x.removido_em
    from jsonb_to_recordset(lote) as x (tabela text, id text, dados jsonb, atualizado_em bigint, removido_em bigint)
  ),
  pai as (
    select e.*, case
      when e.tabela = 'seasons' then 'plots'
      when e.tabela in ('findings', 'photos') then 'visits'
    end as pai_tabela,
    case
      when e.tabela = 'seasons' then e.dados ->> 'plotId'
      when e.tabela in ('findings', 'photos') then e.dados ->> 'visitId'
    end as pai_id
    from e
  )
  select p.tabela, p.id, p.dados, p.atualizado_em, p.removido_em,
    case
      when p.tabela = 'farms' then p.id
      when p.pai_tabela is not null then coalesce(
        (select nullif(q.dados ->> 'farmId', '') from e q where q.tabela = p.pai_tabela and q.id = p.pai_id limit 1),
        (select r.fazenda_id from public.registros r where r.conta_id = conta and r.tabela = p.pai_tabela and r.id = p.pai_id)
      )
      else nullif(p.dados ->> 'farmId', '')
    end
  from pai p
$$;

-- Registros que já estavam no servidor ganham a fazenda pela mesma regra.
update public.registros set fazenda_id = id where tabela = 'farms';
update public.registros set fazenda_id = nullif(dados ->> 'farmId', '')
  where tabela in ('plots', 'visits', 'rainfall', 'operations', 'points', 'sales', 'expenses');
update public.registros r set fazenda_id = p.fazenda_id
  from public.registros p
  where r.tabela = 'seasons' and p.conta_id = r.conta_id and p.tabela = 'plots' and p.id = r.dados ->> 'plotId';
update public.registros r set fazenda_id = v.fazenda_id
  from public.registros v
  where r.tabela in ('findings', 'photos') and v.conta_id = r.conta_id and v.tabela = 'visits' and v.id = r.dados ->> 'visitId';

revoke execute on function
  privado.ve_tudo(uuid), privado.ve_custos(uuid), privado.ve_fazenda(uuid, text),
  privado.tabela_de_dinheiro(text), privado.tabela_de_fazenda(text), privado.sem_custo(uuid, text, jsonb),
  privado.pode_ver(uuid, text, text), privado.fazenda_do_lote(uuid, jsonb)
  from public, anon;
grant execute on function
  privado.ve_tudo(uuid), privado.ve_custos(uuid), privado.ve_fazenda(uuid, text),
  privado.tabela_de_dinheiro(text), privado.tabela_de_fazenda(text), privado.sem_custo(uuid, text, jsonb),
  privado.pode_ver(uuid, text, text), privado.fazenda_do_lote(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sem acesso direto à tabela: só pelas duas funções abaixo.
-- ---------------------------------------------------------------------------------------------

drop policy "membro le os registros" on public.registros;
drop policy "quem registra cria registros" on public.registros;
drop policy "quem registra atualiza registros" on public.registros;
revoke select, insert, update on public.registros from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Receber: o que mudou depois de `desde`, só o que a pessoa pode ver, sem custo para quem não vê.
-- ---------------------------------------------------------------------------------------------

create function public.receber_registros(conta uuid, desde timestamptz, limite integer)
returns table (tabela text, id text, dados jsonb, atualizado_em bigint, removido_em bigint, servidor_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if privado.papel_em(conta) is null then
    raise exception 'sem-acesso' using errcode = '42501';
  end if;
  return query
    select r.tabela, r.id, privado.sem_custo(conta, r.tabela, r.dados), r.atualizado_em, r.removido_em, r.servidor_em
    from public.registros r
    where r.conta_id = conta
      and (desde is null or r.servidor_em > desde)
      and privado.pode_ver(conta, r.tabela, r.fazenda_id)
    order by r.servidor_em
    limit least(greatest(limite, 1), 1000);
end;
$$;

revoke execute on function public.receber_registros(uuid, timestamptz, integer) from public, anon;
grant execute on function public.receber_registros(uuid, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enviar: mesma resposta de antes (aceito ou a versão que venceu), com a fazenda calculada no
-- servidor e a permissão conferida antes de gravar. Um registro proibido recusa o lote inteiro.
-- ---------------------------------------------------------------------------------------------

drop function public.enviar_registros(uuid, jsonb);

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
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ve_dinheiro boolean := privado.ve_custos(conta);
begin
  if not privado.pode_gravar(conta) then
    raise exception 'sem-permissao' using errcode = '42501';
  end if;

  -- O registro novo e, se já existe, o que está gravado: os dois precisam estar ao alcance.
  if exists (
    select 1 from privado.fazenda_do_lote(conta, lote) as e
    left join public.registros r on r.conta_id = conta and r.tabela = e.tabela and r.id = e.id
    where not privado.pode_ver(conta, e.tabela, e.fazenda_id)
       or (r.id is not null and not privado.pode_ver(conta, r.tabela, r.fazenda_id))
  ) then
    raise exception 'sem-permissao' using errcode = '42501';
  end if;

  return query
  with entrada as (
    select e.tabela, e.id,
      -- Quem não vê custo não grava custo.
      case when not ve_dinheiro and e.tabela in ('operations', 'stockMoves') then e.dados - 'cost' else e.dados end as dados,
      e.atualizado_em, e.removido_em, e.fazenda_id
    from privado.fazenda_do_lote(conta, lote) as e
  ),
  gravados as (
    insert into public.registros as r (conta_id, tabela, id, dados, atualizado_em, removido_em, fazenda_id)
    select conta, e.tabela, e.id, e.dados, e.atualizado_em, e.removido_em, e.fazenda_id
    from entrada e
    on conflict (conta_id, tabela, id) do update
      set dados = case
            -- Quem não vê custo manda o registro sem o campo: o custo gravado continua.
            when not ve_dinheiro and excluded.tabela in ('operations', 'stockMoves') and r.dados ? 'cost'
              then (excluded.dados - 'cost') || jsonb_build_object('cost', r.dados -> 'cost')
            else excluded.dados
          end,
          atualizado_em = excluded.atualizado_em,
          removido_em = excluded.removido_em,
          fazenda_id = excluded.fazenda_id
      where r.atualizado_em <= excluded.atualizado_em
    returning r.tabela, r.id, r.servidor_em
  )
  select true, g.tabela, g.id, null::jsonb, null::bigint, null::bigint, g.servidor_em
  from gravados g
  union all
  select false, r.tabela, r.id, privado.sem_custo(conta, r.tabela, r.dados), r.atualizado_em, r.removido_em, r.servidor_em
  from public.registros r
  join entrada e on e.tabela = r.tabela and e.id = r.id
  where r.conta_id = conta
    and not exists (select 1 from gravados g where g.tabela = e.tabela and g.id = e.id);
end;
$$;

revoke execute on function public.enviar_registros(uuid, jsonb) from public, anon;
grant execute on function public.enviar_registros(uuid, jsonb) to authenticated;

-- O gatilho de carimbo grava o autor com auth.uid(), que continua valendo dentro da função.
