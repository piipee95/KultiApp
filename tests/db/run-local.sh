#!/usr/bin/env bash
# Corre tests/db/business-v1-schema.sql en un PostgreSQL local y desechable (nunca toca Supabase).
# Requiere PostgreSQL 16 instalado. Como root usa el usuario `postgres`; si no, el usuario actual.
set -euo pipefail
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-55433}
RUN=""
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN="su postgres -c"; fi
as() { if [ -n "$RUN" ]; then $RUN "$*"; else bash -c "$*"; fi; }
trap 'as "$BIN/pg_ctl -D $DIR/data stop -m immediate >/dev/null 2>&1 || true"; rm -rf "$DIR"' EXIT
as "$BIN/initdb -D $DIR/data -A trust >/dev/null"
as "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
sleep 2
"$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -qc "create database bv1" 2>/dev/null || "$BIN/psql" -h "$DIR" -p "$PORT" -U "$(id -un)" -d postgres -qc "create database bv1"
USER_ARG=postgres; [ -z "$RUN" ] && USER_ARG=$(id -un)
"$BIN/psql" -h "$DIR" -p "$PORT" -U "$USER_ARG" -d bv1 -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/business-v1-schema.sql" 2>&1 | grep -E "ERROR|FALL|DEBÍA|TODO OK" 
