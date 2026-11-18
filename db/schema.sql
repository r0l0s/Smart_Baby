-- =====================================================================
-- Dispositivos Inteligentes para Bebés — esquema completo
-- Pegar TODO este archivo en Supabase → SQL Editor → Run.
-- Se puede ejecutar varias veces sin error (usa "if not exists").
-- Todas las fechas son timestamptz (se guardan en UTC).
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Ambientes: un hogar/familia. Agrupa usuarios y dispositivos.
-- ---------------------------------------------------------------------
create table if not exists ambientes (
  id        uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Usuarios: el principal (con contraseña) y los invitados.
-- Un invitado inicia sesión con SU teléfono + la contraseña del principal.
-- ---------------------------------------------------------------------
create table if not exists usuarios (
  id               uuid primary key default gen_random_uuid(),
  ambiente_id      uuid not null references ambientes(id) on delete cascade,
  rol              text not null check (rol in ('principal', 'invitado')),
  nombre           text not null,
  telefono         text not null unique,          -- normalizado: solo dígitos, con 506
  password_hash    text,                          -- null para invitados
  telegram_chat_id bigint,                        -- null hasta verificar
  verificado       boolean not null default false,
  creado_en        timestamptz not null default now(),
  constraint principal_tiene_password check (rol <> 'principal' or password_hash is not null)
);
create index if not exists usuarios_ambiente_idx on usuarios (ambiente_id);

-- ---------------------------------------------------------------------
-- Tokens de Telegram: verificación de cuenta e invitaciones (24 h, un uso).
-- ---------------------------------------------------------------------
create table if not exists tokens_telegram (
  token       text primary key,
  tipo        text not null check (tipo in ('verificacion', 'invitacion')),
  usuario_id  uuid references usuarios(id) on delete cascade,   -- para verificacion
  ambiente_id uuid references ambientes(id) on delete cascade,  -- para invitacion
  expira_en   timestamptz not null,
  usado       boolean not null default false,
  creado_en   timestamptz not null default now(),
  constraint token_destino check (
    (tipo = 'verificacion' and usuario_id is not null) or
    (tipo = 'invitacion'   and ambiente_id is not null)
  )
);

-- ---------------------------------------------------------------------
-- Dispositivos vinculados a un ambiente.
-- ---------------------------------------------------------------------
create table if not exists dispositivos (
  id            uuid primary key default gen_random_uuid(),
  ambiente_id   uuid not null references ambientes(id) on delete cascade,
  tipo          text not null check (tipo in ('cuna', 'colchon', 'matriz', 'seguridad', 'biberon')),
  codigo        text not null unique,              -- ej. "cuna-01", usado en los tópicos MQTT
  nombre        text not null,
  estado        jsonb not null default '{}'::jsonb, -- último estado conocido
  configuracion jsonb not null default '{}'::jsonb, -- umbrales y opciones
  creado_en     timestamptz not null default now()
);
create index if not exists dispositivos_ambiente_idx on dispositivos (ambiente_id);

-- ---------------------------------------------------------------------
-- Monitoreos: periodo activo de un dispositivo (fin = null mientras está activo).
-- ---------------------------------------------------------------------
create table if not exists monitoreos (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  inicio         timestamptz not null default now(),
  fin            timestamptz
);
create index if not exists monitoreos_dispositivo_idx on monitoreos (dispositivo_id, inicio desc);

-- ---------------------------------------------------------------------
-- Lecturas (alto volumen): temperatura, humedad, movimiento, peso, temp_biberon.
-- ---------------------------------------------------------------------
create table if not exists lecturas (
  id             bigint generated always as identity primary key,
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  monitoreo_id   uuid references monitoreos(id) on delete set null,
  tipo           text not null check (tipo in ('temperatura', 'humedad', 'movimiento', 'peso', 'temp_biberon')),
  valor          numeric not null,
  unidad         text,
  registrado_en  timestamptz not null default now()
);
create index if not exists lecturas_disp_tipo_fecha_idx on lecturas (dispositivo_id, tipo, registrado_en);

-- ---------------------------------------------------------------------
-- Eventos (alto volumen): activacion, desactivacion, alertas, movimiento, puerta, ...
-- ---------------------------------------------------------------------
create table if not exists eventos (
  id             bigint generated always as identity primary key,
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  tipo           text not null,
  detalle        jsonb not null default '{}'::jsonb,
  foto_url       text,
  registrado_en  timestamptz not null default now()
);
create index if not exists eventos_disp_fecha_idx on eventos (dispositivo_id, registrado_en);

-- ---------------------------------------------------------------------
-- Incremento 2
-- ---------------------------------------------------------------------
create table if not exists horarios_matriz (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null unique references dispositivos(id) on delete cascade,
  hora_inicio    time not null,
  duracion_min   integer not null check (duracion_min > 0),
  velocidad      text not null check (velocidad in ('lenta', 'media', 'rapida'))
);

create table if not exists sesiones_alimentacion (
  id             bigint generated always as identity primary key,
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  inicio         timestamptz not null default now(),
  duracion_seg   integer,
  cantidad_ml    numeric
);
create index if not exists sesiones_alim_disp_idx on sesiones_alimentacion (dispositivo_id, inicio);

create table if not exists tiempos_comida (
  id             uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references dispositivos(id) on delete cascade,
  hora           time not null
);

-- ---------------------------------------------------------------------
-- Seguridad: RLS activado en TODAS las tablas y SIN políticas.
-- Así la clave "anon" no puede leer nada; solo el backend (service_role) accede.
-- ---------------------------------------------------------------------
alter table ambientes             enable row level security;
alter table usuarios              enable row level security;
alter table tokens_telegram       enable row level security;
alter table dispositivos          enable row level security;
alter table monitoreos            enable row level security;
alter table lecturas              enable row level security;
alter table eventos               enable row level security;
alter table horarios_matriz       enable row level security;
alter table sesiones_alimentacion enable row level security;
alter table tiempos_comida        enable row level security;

-- Pide a la API de Supabase que vuelva a leer la lista de tablas (evita el error
-- "Could not find the table ... in the schema cache" justo después de crearlas).
notify pgrst, 'reload schema';
