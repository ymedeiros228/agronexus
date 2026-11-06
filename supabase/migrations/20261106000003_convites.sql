-- Convites e pessoas da conta (plano de 06/11/2026, Task 4).
--
-- Dono e gestor convidam com um código de 6 letras (sem I e O, para não confundir com 1 e 0),
-- que vale 7 dias e uma vez só. O convite já diz o papel, as fazendas e se vê custos.
-- A conta sempre tem pelo menos um dono.

create table public.convites (
  codigo text primary key check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  conta_id uuid not null references public.contas (id) on delete cascade,
  papel text not null check (papel in ('dono', 'gestor', 'rt', 'tecnico', 'estagiario', 'produtor', 'leitor')),
  fazendas text[] not null default '{}',
  ve_custos boolean not null default false,
  criado_por uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users (id) on delete set null,
  usado_em timestamptz
);

-- Ninguém lê a tabela direto: só pelas funções.
alter table public.convites enable row level security;
revoke all on public.convites from anon, authenticated;

create function privado.gerencia(conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(privado.papel_em(conta) in ('dono', 'gestor'), false) $$;

revoke execute on function privado.gerencia(uuid) from public, anon;
grant execute on function privado.gerencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Criar convite: devolve o código.
-- ---------------------------------------------------------------------------------------------

create function public.criar_convite(conta uuid, papel text, fazendas text[], ve_custos boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  novo text;
  bytes bytea;
begin
  if not privado.gerencia(conta) then
    raise exception 'so-quem-gerencia' using errcode = '42501';
  end if;
  if papel = 'dono' and privado.papel_em(conta) <> 'dono' then
    raise exception 'so-dono-convida-dono' using errcode = '42501';
  end if;
  -- Sorteio forte: os bytes vêm de gen_random_uuid() (gerador criptográfico do Postgres), não de
  -- random(). São 32 letras e 256 é múltiplo de 32, então cada letra sai com a mesma chance.
  loop
    bytes := uuid_send(gen_random_uuid());
    novo := '';
    for i in 0..5 loop
      novo := novo || substr(letras, 1 + get_byte(bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.convites c where c.codigo = novo);
  end loop;
  insert into public.convites (codigo, conta_id, papel, fazendas, ve_custos, criado_por)
  values (novo, conta, papel, coalesce(fazendas, '{}'), coalesce(ve_custos, false), (select auth.uid()));
  return novo;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Aceitar convite: põe a pessoa na conta com o papel e as fazendas do convite.
-- Quem já é membro não aceita convite (mudar papel é pela tela da equipe, com as travas de
-- dono). O convite só vale se quem criou ainda gerencia a conta (e ainda é dono, se o convite
-- for de dono): convite de quem saiu ou foi rebaixado morre junto.
--
-- Contra quem tenta adivinhar código: qualquer falha devolve null (a mesma resposta para
-- inexistente, usado, vencido ou já membro, para não revelar quais códigos existem) e conta
-- uma tentativa; com 5 erradas na última hora a pessoa fica bloqueada até passar a hora.
-- A falha não usa raise porque o raise desfaria o registro da tentativa.
-- ---------------------------------------------------------------------------------------------

create table privado.tentativas_convite (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  em timestamptz not null default now()
);
create index on privado.tentativas_convite (usuario_id, em);
revoke all on privado.tentativas_convite from public, anon, authenticated;

create function public.aceitar_convite(codigo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  eu uuid := (select auth.uid());
begin
  if eu is null then
    raise exception 'precisa-entrar' using errcode = '42501';
  end if;
  if (select count(*) from privado.tentativas_convite t
      where t.usuario_id = eu and t.em > now() - interval '1 hour') >= 5 then
    raise exception 'muitas-tentativas';
  end if;

  select * into c from public.convites v where v.codigo = upper(replace(trim(aceitar_convite.codigo), ' ', '')) for update;
  if not found
     or c.usado_por is not null
     or c.expira_em < now()
     or not exists (
       select 1 from public.membros m
       where m.conta_id = c.conta_id and m.usuario_id = c.criado_por
         and (m.papel = 'dono' or (m.papel = 'gestor' and c.papel <> 'dono')))
     or exists (select 1 from public.membros m where m.conta_id = c.conta_id and m.usuario_id = eu)
  then
    insert into privado.tentativas_convite (usuario_id) values (eu);
    return null;
  end if;

  insert into public.membros (conta_id, usuario_id, papel, ve_custos)
  values (c.conta_id, eu, c.papel, c.ve_custos);

  insert into public.acessos_fazenda (conta_id, usuario_id, fazenda_id)
  select c.conta_id, eu, f from unnest(c.fazendas) as f;

  update public.convites v set usado_por = eu, usado_em = now() where v.codigo = c.codigo;
  return c.conta_id;
end;
$$;

-- Revogar convite ainda não usado (quem gerencia a conta do convite).
create function public.revogar_convite(codigo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conta uuid := (select v.conta_id from public.convites v
                 where v.codigo = upper(replace(trim(revogar_convite.codigo), ' ', '')));
begin
  if conta is null then
    raise exception 'convite-invalido';
  end if;
  if not privado.gerencia(conta) then
    raise exception 'so-quem-gerencia' using errcode = '42501';
  end if;
  delete from public.convites v
  where v.codigo = upper(replace(trim(revogar_convite.codigo), ' ', '')) and v.usado_por is null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Pessoas da conta: lista, mudar papel/fazendas, tirar.
-- ---------------------------------------------------------------------------------------------

create function public.membros_da_conta(conta uuid)
returns table (usuario_id uuid, nome text, email text, papel text, ve_custos boolean, fazendas text[], desde timestamptz)
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
    -- E-mail só para quem gerencia (ou o próprio): os outros veem nome e papel.
    select m.usuario_id, coalesce(u.raw_user_meta_data ->> 'nome', ''),
      case when privado.gerencia(conta) or m.usuario_id = (select auth.uid()) then u.email::text end,
      m.papel, m.ve_custos,
      coalesce((select array_agg(a.fazenda_id order by a.fazenda_id) from public.acessos_fazenda a
                where a.conta_id = m.conta_id and a.usuario_id = m.usuario_id), '{}'),
      m.criado_em
    from public.membros m
    join auth.users u on u.id = m.usuario_id
    where m.conta_id = conta
    order by m.criado_em;
end;
$$;

create function privado.confere_mudanca(conta uuid, usuario uuid, papel_novo text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  papel_atual text := (select m.papel from public.membros m where m.conta_id = conta and m.usuario_id = usuario);
begin
  if not privado.gerencia(conta) then
    raise exception 'so-quem-gerencia' using errcode = '42501';
  end if;
  if papel_atual is null then
    raise exception 'membro-nao-encontrado';
  end if;
  -- Gestor não mexe em dono nem cria dono.
  if privado.papel_em(conta) <> 'dono' and (papel_atual = 'dono' or papel_novo = 'dono') then
    raise exception 'so-dono-mexe-em-dono' using errcode = '42501';
  end if;
  if papel_atual = 'dono' and coalesce(papel_novo, '') <> 'dono'
     and (select count(*) from public.membros m where m.conta_id = conta and m.papel = 'dono') = 1 then
    raise exception 'ultimo-dono';
  end if;
end;
$$;

create function public.mudar_membro(conta uuid, usuario uuid, papel text, fazendas text[], ve_custos boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.confere_mudanca(conta, usuario, papel);
  update public.membros m set papel = mudar_membro.papel, ve_custos = coalesce(mudar_membro.ve_custos, false)
  where m.conta_id = conta and m.usuario_id = usuario;
  delete from public.acessos_fazenda a where a.conta_id = conta and a.usuario_id = usuario;
  insert into public.acessos_fazenda (conta_id, usuario_id, fazenda_id)
  select conta, usuario, f from unnest(coalesce(fazendas, '{}')) as f;
end;
$$;

-- Tirar alguém (ou sair da conta: usuario = a própria pessoa, que pode sair mesmo sem gerenciar).
create function public.tirar_membro(conta uuid, usuario uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if usuario = (select auth.uid()) and not privado.gerencia(conta) then
    if privado.papel_em(conta) is null then
      raise exception 'membro-nao-encontrado';
    end if;
  else
    perform privado.confere_mudanca(conta, usuario, null);
  end if;
  delete from public.membros m where m.conta_id = conta and m.usuario_id = usuario;
end;
$$;

revoke execute on function privado.confere_mudanca(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function
  public.criar_convite(uuid, text, text[], boolean), public.aceitar_convite(text), public.revogar_convite(text), public.membros_da_conta(uuid),
  public.mudar_membro(uuid, uuid, text, text[], boolean), public.tirar_membro(uuid, uuid)
  from public, anon;
grant execute on function
  public.criar_convite(uuid, text, text[], boolean), public.aceitar_convite(text), public.revogar_convite(text), public.membros_da_conta(uuid),
  public.mudar_membro(uuid, uuid, text, text[], boolean), public.tirar_membro(uuid, uuid)
  to authenticated;
