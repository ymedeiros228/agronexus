-- Papéis, tipo de conta e administrador da plataforma (plano de 06/11/2026, Task 2).
--
-- Papéis: dono, gestor, rt (responsável técnico), tecnico, estagiario, produtor, leitor.
-- O antigo "editor" vira "gestor". Quem grava: dono, gestor, rt, tecnico, estagiario.
-- Produtor e leitor só leem (o que cada um lê por fazenda vem na migração seguinte).

-- ---------------------------------------------------------------------------------------------
-- Contas: tipo e plano (o plano ainda não cobra nada).
-- ---------------------------------------------------------------------------------------------

alter table public.contas
  add column tipo text not null default 'autonomo' check (tipo in ('autonomo', 'empresa', 'produtor')),
  add column plano text not null default 'teste';

-- ---------------------------------------------------------------------------------------------
-- Membros: os sete papéis e a permissão extra de ver custos (para rt e produtor).
-- ---------------------------------------------------------------------------------------------

alter table public.membros drop constraint membros_papel_check;
update public.membros set papel = 'gestor' where papel = 'editor';
alter table public.membros
  add constraint membros_papel_check
    check (papel in ('dono', 'gestor', 'rt', 'tecnico', 'estagiario', 'produtor', 'leitor')),
  add column ve_custos boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- Ajudantes das regras de acesso. Ficam no esquema privado (a API não expõe) e rodam como dono
-- da função para não cair em recursão na RLS de `membros`.
-- ---------------------------------------------------------------------------------------------

grant usage on schema privado to authenticated;

create function privado.papel_em(conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel from public.membros m where m.conta_id = conta and m.usuario_id = (select auth.uid())
$$;

create function privado.pode_gravar(conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(privado.papel_em(conta) in ('dono', 'gestor', 'rt', 'tecnico', 'estagiario'), false)
$$;

revoke execute on function privado.papel_em(uuid), privado.pode_gravar(uuid) from public, anon;
grant execute on function privado.papel_em(uuid), privado.pode_gravar(uuid) to authenticated;

-- As regras de gravação passam a usar os papéis novos.
drop policy "dono e editor criam registros" on public.registros;
drop policy "dono e editor atualizam registros" on public.registros;
drop policy "fotos: dono e editor enviam" on storage.objects;

create policy "quem registra cria registros"
  on public.registros for insert
  to authenticated
  with check (privado.pode_gravar(conta_id));

create policy "quem registra atualiza registros"
  on public.registros for update
  to authenticated
  using (privado.pode_gravar(conta_id))
  with check (privado.pode_gravar(conta_id));

create policy "fotos: quem registra envia"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos'
    and privado.pode_gravar(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------------------------
-- Cadastro: a conta nasce com o tipo escolhido. Quem se cadastra com um convite não ganha conta
-- própria: entra na de quem convidou (função aceitar_convite).
-- ---------------------------------------------------------------------------------------------

create or replace function privado.criar_conta_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova uuid;
  tipo_escolhido text := coalesce(new.raw_user_meta_data ->> 'tipo', 'autonomo');
begin
  if new.raw_user_meta_data ? 'convite' then
    return new;
  end if;
  if tipo_escolhido not in ('autonomo', 'empresa', 'produtor') then
    tipo_escolhido := 'autonomo';
  end if;

  insert into public.contas (nome, tipo)
  values (
    coalesce(left(coalesce(new.raw_user_meta_data ->> 'empresa', new.raw_user_meta_data ->> 'nome'), 120), ''),
    tipo_escolhido
  )
  returning id into nova;

  insert into public.membros (conta_id, usuario_id, papel)
  values (nova, new.id, 'dono');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Contas desta pessoa (para trocar de conta no app).
-- ---------------------------------------------------------------------------------------------

create function public.minhas_contas()
returns table (conta_id uuid, nome text, tipo text, papel text, ve_custos boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.nome, c.tipo, m.papel, m.ve_custos
  from public.membros m
  join public.contas c on c.id = m.conta_id
  where m.usuario_id = (select auth.uid())
  order by m.criado_em
$$;

revoke execute on function public.minhas_contas() from public, anon;
grant execute on function public.minhas_contas() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Administrador da plataforma (equipe do AgroNexus). Ninguém se torna admin pela API: só por
-- SQL no painel do Supabase (insert into privado.administradores).
-- ---------------------------------------------------------------------------------------------

create table privado.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.administradores a where a.usuario_id = (select auth.uid()))
$$;

create function public.admin_contas()
returns table (
  conta_id uuid,
  nome text,
  tipo text,
  plano text,
  criada_em timestamptz,
  membros integer,
  registros integer,
  ultimo_envio timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'so-admin' using errcode = '42501';
  end if;
  return query
    select c.id, c.nome, c.tipo, c.plano, c.criada_em,
      (select count(*)::integer from public.membros m where m.conta_id = c.id),
      (select count(*)::integer from public.registros r where r.conta_id = c.id),
      (select max(r.servidor_em) from public.registros r where r.conta_id = c.id)
    from public.contas c
    order by c.criada_em desc;
end;
$$;

revoke execute on function public.sou_admin(), public.admin_contas() from public, anon;
grant execute on function public.sou_admin(), public.admin_contas() to authenticated;
